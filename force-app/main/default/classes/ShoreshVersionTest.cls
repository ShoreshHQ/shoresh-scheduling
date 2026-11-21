@IsTest
private class ShoreshVersionTest {
  // CORE-6.16: Help shows the installed version as major.minor.
  @IsTest
  static void theInstalledVersionIsSaidAsMajorDotMinor() {
    ShoreshVersion.installed = new Version(1, 4);
    Assert.areEqual('1.4', ShoreshVersion.installedVersion());
  }

  // CORE-6.16: outside an installed package there is no version to show.
  @IsTest
  static void outsideAPackageThereIsNoneOrARealOne() {
    String shown = ShoreshVersion.installedVersion();
    Assert.isTrue(
      shown == null || Pattern.matches('\\d+\\.\\d+', shown),
      'None, or major.minor: ' + shown
    );
  }
}
