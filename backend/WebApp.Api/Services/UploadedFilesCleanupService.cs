using Azure.AI.Extensions.OpenAI;
using Azure.AI.Projects;
using OpenAI.Files;

namespace WebApp.Api.Services;

#pragma warning disable OPENAI001

/// <summary>
/// Periodically deletes images this web app uploaded to the Foundry Files API once they exceed the retention period.
/// </summary>
/// <remarks>
/// Replaces the former <c>POST /api/files/cleanup</c> endpoint, which let any signed-in user delete every user's
/// uploads. The GA Files API does not expose <c>expires_after</c>, so retention is enforced here.
/// Only files whose name starts with <see cref="AgentFrameworkService.WebAppUploadFilenamePrefix"/> are touched.
/// Configuration (section <c>Uploads</c>): <c>CleanupEnabled</c>, <c>RetentionHours</c> (default 168 = 7 days),
/// <c>CleanupIntervalHours</c> (default 6). Disabled by default in Development.
/// With scale-to-zero the job only runs while a replica is alive, which is enough for this volume.
/// </remarks>
public sealed class UploadedFilesCleanupService(
    IConfiguration configuration,
    IHostEnvironment environment,
    ILogger<UploadedFilesCleanupService> logger) : BackgroundService
{
    private static readonly TimeSpan InitialDelay = TimeSpan.FromMinutes(5);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var section = configuration.GetSection("Uploads");
        var enabled = section.GetValue("CleanupEnabled", !environment.IsDevelopment());
        var endpoint = configuration["AI_AGENT_ENDPOINT"];
        if (!enabled || string.IsNullOrWhiteSpace(endpoint) || !Uri.TryCreate(endpoint, UriKind.Absolute, out var endpointUri))
        {
            logger.LogInformation("Uploaded files cleanup is disabled");
            return;
        }

        var retention = TimeSpan.FromHours(Math.Max(1, section.GetValue("RetentionHours", 168)));
        var interval = TimeSpan.FromHours(Math.Max(1, section.GetValue("CleanupIntervalHours", 6)));

        try
        {
            await Task.Delay(InitialDelay, stoppingToken);

            var client = new AIProjectClient(endpointUri, FoundryCredentialFactory.CreateAppCredential(configuration, environment));
            using var timer = new PeriodicTimer(interval);
            do
            {
                await RunOnceAsync(client.ProjectOpenAIClient.GetOpenAIFileClient(), retention, stoppingToken);
            }
            while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Normal shutdown.
        }
    }

    private async Task RunOnceAsync(OpenAIFileClient fileClient, TimeSpan retention, CancellationToken cancellationToken)
    {
        var cutoff = DateTimeOffset.UtcNow - retention;
        int deleted = 0, failed = 0;

        try
        {
            var files = await fileClient.GetFilesAsync(FilePurpose.Assistants, cancellationToken);
            foreach (var file in files.Value)
            {
                if (file.Filename is null
                    || !file.Filename.StartsWith(AgentFrameworkService.WebAppUploadFilenamePrefix, StringComparison.Ordinal)
                    || file.CreatedAt > cutoff)
                {
                    continue;
                }

                try
                {
                    await fileClient.DeleteFileAsync(file.Id, cancellationToken);
                    deleted++;
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    failed++;
                    logger.LogWarning(ex, "Failed to delete uploaded file {FileId}", file.Id);
                }
            }

            logger.LogInformation("Uploaded files cleanup finished: deleted={Deleted} failed={Failed}", deleted, failed);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Never crash the host because of a maintenance job.
            logger.LogWarning(ex, "Uploaded files cleanup run failed");
        }
    }
}
