import { Fixture, normalizeCommitSHAs, normalizeEnvironment } from "@lerna/e2e-utils";

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomVersion = () => `${randomInt(10, 89)}.${randomInt(10, 89)}.${randomInt(10, 89)}`;

expect.addSnapshotSerializer({
  serialize(str: string) {
    return normalizeCommitSHAs(normalizeEnvironment(str))
      .replaceAll(/integrity:\s*.*/g, "integrity: XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX")
      .replaceAll(/\d*B package\.json/g, "XXXB package.json")
      .replaceAll(/size:\s*\d*\s?B/g, "size: XXXB")
      .replaceAll(/\d*\.\d*\s?kB/g, "XXX.XXX kb");
  },
  test(val: string) {
    return val != null && typeof val === "string";
  },
});

describe("lerna-publish-from-git-recover-from-error", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await Fixture.create({
      e2eRoot: process.env.E2E_ROOT,
      name: "lerna-publish-from-git-recover-from-error",
      packageManager: "npm",
      initializeGit: true,
      runLernaInit: true,
      installDependencies: true,
    });
  });
  afterEach(() => fixture.destroy());

  describe("from-git", () => {
    it("should publish remaining packages to the remote registry even if one has already been published", async () => {
      await fixture.lerna("create test-1 -y");
      await fixture.createInitialGitCommit();
      await fixture.exec("git push --set-upstream origin test-main");

      const version = randomVersion();
      await fixture.lerna(`version ${version} -y`);
      await fixture.lerna("publish from-git --registry=http://localhost:4872 -y");

      // set up a scenario where one package needs to be published but the
      // other has already been published.
      await fixture.lerna("create test-2 -y");
      await fixture.exec("git add . && git commit --amend --no-edit");
      await fixture.exec("git push -f");
      await fixture.exec(`git tag -d v${version}`);
      await fixture.exec(`git push --delete origin v${version}`);
      await fixture.exec(`git tag -a v${version} -m v${version}`);
      await fixture.exec("git push --tags");

      // publish both packages again, with test-1 failing
      // because it is already published
      const output = await fixture.lerna("publish from-git --registry=http://localhost:4872 -y");
      const unpublishOutput1 = await fixture.exec(
        `npm unpublish --force test-1@${version} --registry=http://localhost:4872`
      );
      const unpublishOutput2 = await fixture.exec(
        `npm unpublish --force test-2@${version} --registry=http://localhost:4872`
      );

      const replaceVersion = (str: string) => str.replaceAll(version, "XX.XX.XX");

      expect(replaceVersion(output.combinedOutput)).toMatchInlineSnapshot(`
        lerna notice cli v999.9.9-e2e.0

        Found 2 packages to publish:
         - test-1 => XX.XX.XX
         - test-2 => XX.XX.XX

        lerna info auto-confirmed 
        lerna info publish Publishing packages to npm...
        lerna notice Skipping all user and access validation due to third-party registry
        lerna notice Make sure you're authenticated properly ¯\\_(ツ)_/¯
        lerna WARN ENOLICENSE Packages test-1 and test-2 are missing a license.
        lerna WARN ENOLICENSE One way to fix this is to add a LICENSE.md file to the root of this repository.
        lerna WARN ENOLICENSE See https://choosealicense.com for additional guidance.
        lerna WARN publish Package is already published: test-1@XX.XX.XX
        lerna success published test-2 XX.XX.XX
        lerna notice 
        lerna notice 📦  test-2@XX.XX.XX
        lerna notice === Tarball Contents === 
        lerna notice 92B  lib/test-2.js
        lerna notice XXXB package.json 
        lerna notice 110B README.md    
        lerna notice === Tarball Details === 
        lerna notice name:          test-2                                  
        lerna notice version:       XX.XX.XX                                
        lerna notice filename:      test-2-XX.XX.XX.tgz                     
        lerna notice package size: XXXB                                   
        lerna notice unpacked size: XXX.XXX kb                                  
        lerna notice shasum:        {FULL_COMMIT_SHA}
        lerna notice integrity: XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
        lerna notice total files:   3                                       
        lerna notice 
        Successfully published:
         - test-2@XX.XX.XX
        lerna success published 1 package

      `);

      expect(replaceVersion(unpublishOutput1.combinedOutput)).toMatchInlineSnapshot(`
        npm WARN using --force Recommended protections disabled.
        - test-1@XX.XX.XX

      `);

      expect(replaceVersion(unpublishOutput2.combinedOutput)).toMatchInlineSnapshot(`
        npm WARN using --force Recommended protections disabled.
        - test-2@XX.XX.XX

      `);
    });
  });
});
