using Microsoft.VisualStudio.TestTools.UnitTesting;
using WebApp.Api.Security;

namespace WebApp.Api.Tests;

[TestClass]
public class ConversationOwnershipTests
{
    private const string UserA = "11111111-1111-1111-1111-111111111111";
    private const string UserB = "22222222-2222-2222-2222-222222222222";

    private static Dictionary<string, string> MetadataOwnedBy(string owner) =>
        new() { [ConversationOwnership.OwnerMetadataKey] = owner, [ConversationOwnership.TitleMetadataKey] = "t" };

    [TestMethod]
    public void Owner_IsGrantedAccess()
    {
        Assert.IsTrue(ConversationOwnership.IsOwnedBy(MetadataOwnedBy(UserA), UserA));
    }

    [TestMethod]
    public void OwnerComparison_IgnoresGuidCasing()
    {
        Assert.IsTrue(ConversationOwnership.IsOwnedBy(MetadataOwnedBy(UserA.ToUpperInvariant()), UserA));
    }

    [TestMethod]
    public void OtherUser_IsDenied()
    {
        Assert.IsFalse(ConversationOwnership.IsOwnedBy(MetadataOwnedBy(UserA), UserB));
    }

    [TestMethod]
    public void LegacyConversationWithoutOwner_IsDenied()
    {
        var metadata = new Dictionary<string, string> { [ConversationOwnership.TitleMetadataKey] = "sin dueño" };

        Assert.IsFalse(ConversationOwnership.IsOwnedBy(metadata, UserA));
        Assert.IsFalse(ConversationOwnership.IsOwnedBy(null, UserA));
    }

    [TestMethod]
    [DataRow("")]
    [DataRow("  ")]
    public void EmptyCallerId_IsDenied(string caller)
    {
        Assert.IsFalse(ConversationOwnership.IsOwnedBy(MetadataOwnedBy(""), caller));
    }

    [TestMethod]
    public void BuildTitle_TruncatesWithoutSplittingSurrogatePairs()
    {
        var message = new string('a', 49) + "😀😀";

        var title = ConversationOwnership.BuildTitle(message);

        Assert.AreEqual(new string('a', 49) + "😀...", title);
    }

    [TestMethod]
    public void BuildTitle_ReturnsNullForEmptyMessage()
    {
        Assert.IsNull(ConversationOwnership.BuildTitle("   "));
    }
}
