namespace WebApp.Api.Infrastructure.Configuration;

/// <summary>
/// Loads a local <c>.env</c> file (written by the azd postprovision hook for local development).
/// </summary>
/// <remarks>
/// Not suitable as a production configuration source: in Azure, Container Apps injects environment variables.
/// Existing environment variables always win, so a stray <c>.env</c> can never override the real configuration.
/// The file is git-ignored and docker-ignored and contains identifiers only (no secrets).
/// </remarks>
public static class DotEnvLoader
{
    public static void LoadIfPresent(string path)
    {
        if (!File.Exists(path))
            return;

        foreach (var (key, value) in Parse(File.ReadAllLines(path)))
        {
            if (Environment.GetEnvironmentVariable(key) is null)
                Environment.SetEnvironmentVariable(key, value);
        }
    }

    internal static IEnumerable<(string Key, string Value)> Parse(IEnumerable<string> lines)
    {
        foreach (var rawLine in lines)
        {
            var line = rawLine.Trim();
            if (line.Length == 0 || line.StartsWith('#'))
                continue;
            if (line.StartsWith("export ", StringComparison.Ordinal))
                line = line["export ".Length..];

            var parts = line.Split('=', 2, StringSplitOptions.TrimEntries);
            if (parts.Length == 2 && parts[0].Length > 0)
                yield return (parts[0], Unquote(parts[1]));
        }
    }

    private static string Unquote(string value) =>
        value.Length >= 2 && (value[0] == '"' && value[^1] == '"' || value[0] == '\'' && value[^1] == '\'')
            ? value[1..^1]
            : value;
}
