{
  description = "T3 Code development environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems =
        function: nixpkgs.lib.genAttrs systems (system: function (import nixpkgs { inherit system; }));
      devShellFor =
        pkgs:
        pkgs.mkShell {
          packages = with pkgs; [
            git
            jujutsu
            nodejs_26
            pnpm
            playwright-test
          ];
          PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
          PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
        };
    in
    {
      devShells = forAllSystems (pkgs: {
        default = devShellFor pkgs;
      });

      # Materialize the declared toolchain for `nix build .`; application packaging remains in
      # the repository's Vite Plus build scripts.
      packages = forAllSystems (pkgs: {
        default = devShellFor pkgs;
      });

      formatter = forAllSystems (pkgs: pkgs.nixfmt-rfc-style);
    };
}
