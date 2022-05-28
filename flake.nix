{
  description = "backpressure-queue";

  inputs = { flake-utils.url = "github:numtide/flake-utils"; };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        inherit (pkgs) lib stdenv;

        src = lib.cleanSourceWith {
          name = "backpressure-queue-src";
          filter = name: type:
            let baseName = baseNameOf (toString name);
            in (lib.cleanSourceFilter name type
              && !(lib.hasSuffix ".nix" baseName && isFile type)
              && !(lib.hasSuffix ".patch" baseName && isFile type));
          src = pkgs.nix-gitignore.gitignoreRecursiveSource "" ./.;
        };

        # See the listing @ <https://github.com/NixOS/nixpkgs/blob/1e1396aafccff9378b8f3d0c686e277c226398cf/lib/sources.nix#L23-L26>
        isFile = type: type == "regular";

        # allow inspecting what the 'cleaned' source files consist of.
        cleanedSrc = stdenv.mkDerivation {
          inherit src;
          name = "cleaned-source";
          buildPhase = "";
          installPhase = ''
            mkdir -p $out
            cp -r ./* $out
          '';
        };

      in {
        devShell = # used by `nix develop`
          pkgs.mkShell {
            name = "backpressure-queue-devshell";
            buildInputs = with pkgs; [ nixfmt nodejs ];
            shellHook = ''
              export PATH=$(git rev-parse --show-toplevel)/node_modules/.bin/:$PATH
            '';
          };
        packages = { inherit cleanedSrc; };
      });
}
