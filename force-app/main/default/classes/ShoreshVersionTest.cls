@IsTest
private class ShoreshVersionTest {
  // CORE-6.16: Help shows the installed version as major.minor.
  @IsTest
  static void theInstalledVersionIsSaidAsMajorDotMinor() {
    ShoreshVersion.installed = new Version(1, 4);
    Assert.areEqual('1.4', ShoreshVersion.installedVersion());
  }

  // CORE-6.16: outside an installed package there is no version to show, and asking never
  // stops the request. Run only where there is no namespace (the test org): in the build org
  // that has it (sf package version create) nothing is installed either, and Salesforce's own
  // answer there isn't Shoresh's to test.
  @IsTest
  static void outsideAPackageThereIsNone() {
    if (ShoreshSchema.namespace() == null) {
      Assert.isNull(ShoreshVersion.installedVersion());
    }
  }
}
