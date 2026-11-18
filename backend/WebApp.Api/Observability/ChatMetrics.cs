using System.Diagnostics.Metrics;
using WebApp.Api.Models;

namespace WebApp.Api.Observability;

/// <summary>
/// Custom OpenTelemetry metrics exported to Application Insights (customMetrics).
/// Only counts and durations are recorded: never prompts, responses, file names or user identifiers.
/// </summary>
public sealed class ChatMetrics : IDisposable
{
    public const string MeterName = "LeitnerIA.Chat";

    private readonly Meter _meter;
    private readonly Counter<long> _tokens;
    private readonly Counter<long> _streams;
    private readonly Histogram<double> _duration;

    public ChatMetrics(IMeterFactory meterFactory)
    {
        _meter = meterFactory.Create(MeterName);
        _tokens = _meter.CreateCounter<long>("leitneria.chat.tokens", unit: "{token}", description: "Model tokens consumed");
        _streams = _meter.CreateCounter<long>("leitneria.chat.streams", unit: "{stream}", description: "Chat streams by outcome");
        _duration = _meter.CreateHistogram<double>("leitneria.chat.duration", unit: "ms", description: "Agent response duration");
    }

    public void RecordUsage(UsageEvent usage)
    {
        _tokens.Add(usage.PromptTokens, new KeyValuePair<string, object?>("direction", "input"));
        _tokens.Add(usage.CompletionTokens, new KeyValuePair<string, object?>("direction", "output"));
        _duration.Record(usage.Duration);
    }

    public void RecordStream(string outcome) =>
        _streams.Add(1, new KeyValuePair<string, object?>("outcome", outcome));

    public void Dispose() => _meter.Dispose();
}
