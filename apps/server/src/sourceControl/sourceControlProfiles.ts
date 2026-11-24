// @effect-diagnostics nodeBuiltinImport:off - A GitHub App key is checked with node's crypto before it is saved.
import * as NodeCrypto from "node:crypto";

import type { SourceControlProfileName, SourceControlProviderKind } from "@t3tools/contracts";
import * as SourceControlHost from "@t3tools/source-control-core/server/SourceControlHost";
import {
  ProfileSettings,
  readSourceControlHostSettings,
} from "@t3tools/source-control-core/shared/definition";
import * as GitHub from "@t3tools/source-control-github/shared/definition";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

import { sourceControlDefinitions } from "./sourceControlDefinitions.ts";

const saveLock = Semaphore.makeUnsafe(1);

export class SourceControlProfileError extends Schema.TaggedError<SourceControlProfileError>()(
  "SourceControlProfileError",
  { detail: Schema.String },
) {
  override get message(): string {
    return this.detail;
  }
}

/**
 * Saves `secret` as profile `name` of host kind `kind`, in that host's settings, whose secrets T3
 * keeps in its secret store; saving a name again replaces it. A GitHub `githubAppId` marks the
 * secret as that GitHub App's private key.
 */
export const saveSourceControlProfile = Effect.fn("SourceControlProfiles.save")(function* (input: {
  readonly kind: SourceControlProviderKind;
  readonly name: SourceControlProfileName;
  readonly secret: string;
  readonly githubAppId: number | undefined;
}) {
  const refuse = (detail: string) => new SourceControlProfileError({ detail });
  const definition = sourceControlDefinitions.definitions.find(
    (candidate) => candidate.kind === input.kind,
  );
  if (definition?.credentials?.profiles !== true) {
    return yield* refuse(`Source control "${input.kind}" has no profiles.`);
  }
  const isGitHub = input.kind === GitHub.definition.kind;
  if (input.githubAppId !== undefined && !isGitHub) {
    return yield* refuse("`githubAppId` belongs to a `github` profile.");
  }
  const value = input.secret.trim();
  if (value === "") return yield* refuse(`The value for profile "${input.name}" is empty.`);
  // Looked up, not required, so the tool that saves keeps upstream's declared dependencies.
  const host = yield* Effect.serviceOption(SourceControlHost.SourceControlHost);
  if (Option.isNone(host)) return yield* refuse("T3's source control settings are not available.");
  // The card's password field drops line breaks, so a pasted PEM fails here, not at the first PR.
  if (input.githubAppId !== undefined) {
    const pem = value.startsWith("-----BEGIN")
      ? value
      : Buffer.from(value, "base64").toString("utf8");
    yield* Effect.try({
      try: () => NodeCrypto.createPrivateKey(pem),
      catch: () =>
        refuse(
          `The value for GitHub App profile "${input.name}" is not a private key. Paste the key as base64 on one line.`,
        ),
    });
  }
  const failed = (cause: { readonly message: string }) =>
    refuse(`Could not save profile "${input.name}": ${cause.message}`);
  const settings = host.value.settings;

  // The whole map goes back, as the Settings page sends it; the other secrets keep their values.
  // One save at a time, so two saves never both write a map read before the other's write.
  yield* Effect.gen(function* () {
    const current = (yield* settings.get).sourceControlHosts[input.kind];
    const { profiles } = readSourceControlHostSettings(ProfileSettings, current);
    const { [input.name]: _replaced, ...appIds } = isGitHub
      ? readSourceControlHostSettings(GitHub.settings, current).profileAppIds
      : {};
    yield* settings.update({
      sourceControlHosts: {
        [input.kind]: {
          profiles: { ...profiles, [input.name]: value },
          ...(isGitHub
            ? {
                profileAppIds:
                  input.githubAppId === undefined
                    ? appIds
                    : { ...appIds, [input.name]: input.githubAppId },
              }
            : {}),
        },
      },
    });
  }).pipe(Effect.mapError(failed), Semaphore.withPermit(saveLock));
});
