using Microsoft.Extensions.Options;
using WebApp.Api.Application;
using WebApp.Api.Infrastructure.Configuration;
using WebApp.Api.Observability;

namespace WebApp.Api.Infrastructure.Foundry;

public static class FoundryServiceCollectionExtensions
{
    /// <summary>
    /// Registers the application services and the Foundry adapters behind the <see cref="IAgentGateway"/> and
    /// <see cref="IConversationStore"/> ports. Configuration is validated at startup (fail fast).
    /// </summary>
    public static WebApplicationBuilder AddLeitnerAgent(this WebApplicationBuilder builder)
    {
        var isDevelopment = builder.Environment.IsDevelopment();
        var services = builder.Services;

        services.AddOptions<FoundryOptions>()
            .Configure<IConfiguration>((options, configuration) => FoundryOptions.Bind(options, configuration))
            .ValidateOnStart();
        services.AddSingleton<IValidateOptions<FoundryOptions>>(new FoundryOptionsValidator(isDevelopment));

        services.AddMemoryCache();
        services.AddHttpContextAccessor();
        services.AddMetrics();
        services.AddSingleton<ChatMetrics>();

        // Infrastructure (adapters)
        services.AddSingleton<FoundryAppClient>();
        services.AddScoped<FoundryClientFactory>();
        services.AddScoped<FoundryAgentCatalog>();
        services.AddScoped<IAgentGateway, FoundryAgentGateway>();
        services.AddScoped<IConversationStore, FoundryConversationStore>();
        services.AddHostedService<UploadedFilesCleanupService>();

        // Application (use cases)
        services.AddScoped<ConversationService>();
        services.AddScoped<ChatService>();

        return builder;
    }

    /// <summary>Reports every configuration problem at once with a readable message.</summary>
    private sealed class FoundryOptionsValidator(bool isDevelopment) : IValidateOptions<FoundryOptions>
    {
        public ValidateOptionsResult Validate(string? name, FoundryOptions options)
        {
            var errors = options.Validate(isDevelopment).ToList();
            return errors.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(errors);
        }
    }
}
