using Microsoft.VisualStudio.TestTools.UnitTesting;
using WebApp.Api.Services;

namespace WebApp.Api.Tests;

/// <summary>
/// The upload prefix is a contract with <see cref="UploadedFilesCleanupService"/>: changing it would orphan
/// every file uploaded by previous builds (the cleanup would no longer recognize them).
/// </summary>
[TestClass]
public class UploadedFilesPrefixTests
{
    [TestMethod]
    public void Prefix_IsStableValue()
    {
        Assert.AreEqual("webapp-upload-", AgentFrameworkService.WebAppUploadFilenamePrefix);
    }
}
