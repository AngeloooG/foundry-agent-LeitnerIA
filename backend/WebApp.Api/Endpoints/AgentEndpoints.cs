using WebApp.Api.Application;
using WebApp.Api.Models;
using WebApp.Api.Security;

namespace WebApp.Api.Endpoints;

public static class AgentEndpoints
{
    /// <summary>
    /// <c>GET /api/agent</c>: public agent information (no system prompt, model or raw metadata).
    /// </summary>
    public static RouteGroupBuilder MapAgentEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/agent", async (IAgentGateway agent, CancellationToken cancellationToken) =>
            {
                var info = await agent.GetAgentInfoAsync(cancellationToken);
                return Results.Ok(new AgentMetadataResponse
                {
                    Id = info.Id,
                    Name = info.Name,
                    Description = info.Description,
                    StarterPrompts = info.StarterPrompts?.ToList(),
                });
            })
            .RequireRateLimiting(RateLimitPolicies.Api)
            .WithName("GetAgentMetadata");

        return api;
    }
}
