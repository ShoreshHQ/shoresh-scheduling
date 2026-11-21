@IsTest
private class ShoreshVersionTest {
  // CORE-6.16: Help shows the installed version as major.minor.
  @IsTest
  static void theInstalledVersionIsSaidAsMajorDotMinor() {
    ShoreshVersion.installed = new Version(1, 4);
    Assert.areEqual('1.4', ShoreshVersion.installedVersion());
  }

  // CORE-6.16: outside an installed package there is no version to show, and asking never
  // stops the request (the test org has no namespace).
  @IsTest
  static void outsideAPackageThereIsNone() {
    String shown = ShoreshVersion.installedVersion();
    if (ShoreshSchema.namespace() == null) {
      Assert.isNull(shown);
    } else {
      Assert.isTrue(
        shown == null || Pattern.matches('\\d+\\.\\d+', shown),
        'None, or major.minor: ' + shown
      );
    }
  }
}
