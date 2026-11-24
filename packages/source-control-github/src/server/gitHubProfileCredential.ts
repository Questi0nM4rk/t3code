// @effect-diagnostics nodeBuiltinImport:off - The GitHub App JWT is signed with RS256, which needs node's crypto.
import * as NodeCrypto from "node:crypto";

import { requireSettingsSecretLiteral, type SourceControlProfileName } from "@t3tools/contracts";
import type * as SourceControlHost from "@t3tools/source-control-core/server/SourceControlHost";
import { readSourceControlHostSettings } from "@t3tools/source-control-core/shared/definition";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import * as GitHubClient from "../shared/definition.ts";
import * as GitHubRequestPolicy from "./GitHubRequestPolicy.ts";
import type * as GitHubRest from "./GitHubRest.ts";

export class GitHubProfileError extends Schema.TaggedError<GitHubProfileError>()(
  "GitHubProfileError",
  { detail: Schema.String, cause: Schema.optional(Schema.Defect()) },
) {
  override get message(): string {
    return this.detail;
  }
}

/** The only host a profile signs in to, as `GH_TOKEN` is kept to github.com. */
const PROFILE_HOST = "github.com";

type PinnedCredential = NonNullable<typeof GitHubRequestPolicy.PinnedGitHubCredential.Service>;

const decodeInstallation = Schema.decodeEffect(
  Schema.fromJsonString(Schema.Struct({ id: Schema.Number })),
);
const decodeToken = Schema.decodeEffect(
  Schema.fromJsonString(Schema.Struct({ token: Schema.String })),
);

const failed = (detail: string) => (cause: { readonly message: string }) =>
  new GitHubProfileError({ detail: `${detail}: ${cause.message}`, cause });

/**
 * The credential a change request opens with: the profile it names, else the default chosen in
 * Settings, else null for the usual credential. An App profile mints a token for `repo` each time.
 */
export const makeProfileCredential = (
  api: GitHubRest.GitHubRest["Service"],
  sourceControlHost: SourceControlHost.SourceControlHost["Service"],
) => {
  const credential = Effect.fn("GitHubProfiles.credential")(function* (input: {
    readonly host: string;
    readonly owner: string;
    readonly repo: string;
    readonly profile: SourceControlProfileName | undefined;
  }) {
    // A profile is saved for github.com: its token must never reach a host the remote names.
    if (input.host.toLowerCase() !== PROFILE_HOST) {
      if (input.profile === undefined) return null;
      return yield* new GitHubProfileError({
        detail: `GitHub profiles sign in to ${PROFILE_HOST} only, not ${input.host}.`,
      });
    }
    const saved = yield* sourceControlHost.settings
      .getWithSecrets(GitHubClient.definition.kind)
      .pipe(Effect.mapError(failed("Could not read the GitHub settings")));
    const github = readSourceControlHostSettings(
      GitHubClient.settings,
      saved.sourceControlHosts[GitHubClient.definition.kind],
    );
    const name = input.profile ?? github.pullRequestProfile;
    if (name === null) return null;
    // Own keys only: a name such as `constructor` must not find what a plain object inherits.
    const value = Object.hasOwn(github.profiles, name) ? github.profiles[name] : undefined;
    if (value === undefined) {
      return yield* new GitHubProfileError({
        detail: `No GitHub profile "${name}". Saved: ${Object.keys(github.profiles).join(", ") || "none"}.`,
      });
    }
    const secret = yield* requireSettingsSecretLiteral(value, saved.secretProviders).pipe(
      Effect.mapError(failed(`Could not read GitHub profile "${name}"`)),
    );
    const appId = Object.hasOwn(github.profileAppIds, name)
      ? github.profileAppIds[name]
      : undefined;
    const token =
      appId === undefined
        ? secret
        : yield* mintAppToken({ ...input, name, appId, privateKey: secret });
    return {
      name,
      credential: {
        host: input.host,
        token: Redacted.make(token),
        credentialFingerprint: `${input.host}:profile:${name}`,
      } satisfies PinnedCredential,
    };
  });

  /** A fresh installation token of the App, limited to `repo`, asked for with the App's JWT. */
  const mintAppToken = Effect.fn("GitHubProfiles.mintAppToken")(function* (input: {
    readonly host: string;
    readonly owner: string;
    readonly repo: string;
    readonly name: SourceControlProfileName;
    readonly appId: number;
    readonly privateKey: string;
  }) {
    const key = yield* Effect.try({
      try: () =>
        NodeCrypto.createPrivateKey(
          input.privateKey.startsWith("-----BEGIN")
            ? input.privateKey
            : Buffer.from(input.privateKey, "base64").toString("utf8"),
        ),
      catch: (cause) =>
        new GitHubProfileError({
          detail: `GitHub profile "${input.name}" is a GitHub App, but its value is not a private key (PEM or base64 PEM).`,
          cause,
        }),
    });
    const now = Math.floor((yield* Clock.currentTimeMillis) / 1000);
    const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const unsigned = `${part({ alg: "RS256", typ: "JWT" })}.${part({ iat: now - 60, exp: now + 540, iss: String(input.appId) })}`;
    const signature = NodeCrypto.sign("RSA-SHA256", Buffer.from(unsigned), key);
    const asApp = Effect.provideService(GitHubRequestPolicy.PinnedGitHubCredential, {
      host: input.host,
      token: Redacted.make(`${unsigned}.${signature.toString("base64url")}`),
      credentialFingerprint: `${input.host}:profile-app:${input.name}`,
    });
    const installation = yield* api
      .rest({
        host: input.host,
        operation: "profileAppInstallation",
        path: `repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/installation`,
        allowReserve: true,
      })
      .pipe(
        asApp,
        Effect.flatMap((response) => decodeInstallation(response.body)),
        // Only a 404 means "not installed"; a refused JWT means the key or App ID is wrong.
        Effect.mapError((cause) =>
          failed(
            cause._tag === "GitHubApiNotFoundError"
              ? `GitHub App profile "${input.name}" is not installed on ${input.owner}/${input.repo}`
              : `GitHub refused the App key or App ID of profile "${input.name}"`,
          )(cause),
        ),
      );
    const minted = yield* api
      .rest({
        host: input.host,
        operation: "profileAppToken",
        method: "POST",
        path: `app/installations/${installation.id}/access_tokens`,
        body: { repositories: [input.repo] },
        allowReserve: true,
      })
      .pipe(
        asApp,
        Effect.flatMap((response) => decodeToken(response.body)),
        Effect.mapError(failed(`GitHub App profile "${input.name}" got no token`)),
      );
    return minted.token;
  });

  return credential;
};
