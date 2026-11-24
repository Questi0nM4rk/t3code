import type { EnvironmentId } from "@t3tools/contracts";
import {
  readProfileSettings,
  type SourceControlDefinition,
} from "@t3tools/client-runtime/source-control-clients";
import { T, useGT, Var } from "gt-react";
import { useState } from "react";

import { useEnvironmentSettings } from "../../hooks/useSettings";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";

/** Sentinel select value for "no profile"; profile names never contain spaces. */
const SIGNED_IN = "signed in account";

/** Lists a host's saved profiles and picks the one a change request opens as by default. */
export function ChangeRequestProfileSettings({
  environmentId,
  definition,
}: {
  readonly environmentId: EnvironmentId;
  readonly definition: SourceControlDefinition;
}) {
  const gt = useGT();
  const { names, pullRequestProfile } = useEnvironmentSettings(environmentId, (settings) =>
    readProfileSettings(settings, definition.kind),
  );
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, {
    label: `save the ${definition.label} profile`,
  });
  const [saving, setSaving] = useState(false);
  const { plural } = definition.changeRequest;

  const save = async (profile: string | null) => {
    setSaving(true);
    await updateSettings({
      environmentId,
      input: {
        patch: { sourceControlHosts: { [definition.kind]: { pullRequestProfile: profile } } },
      },
    });
    setSaving(false);
  };

  const chosen =
    pullRequestProfile !== null && names.includes(pullRequestProfile)
      ? pullRequestProfile
      : SIGNED_IN;

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 space-y-0.5">
        <span className="text-xs font-medium text-foreground">
          <T>
            Open <Var>{plural}</Var> as
          </T>
        </span>
        <p className="text-xs text-muted-foreground">
          <T>
            The profile an agent uses when it names none. Agents save profiles with request_secret.
          </T>
        </p>
      </div>
      <div className="w-64 max-w-full">
        <Select
          value={chosen}
          disabled={saving}
          onValueChange={(value) => {
            if (typeof value !== "string") return;
            void save(value === SIGNED_IN ? null : value);
          }}
        >
          <SelectTrigger
            size="sm"
            aria-label={gt("{label} profile to open {plural} as", {
              label: definition.label,
              plural,
            })}
          >
            <SelectValue>
              {(value: string) => (value === SIGNED_IN ? <T>Signed-in account</T> : value)}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            <SelectItem value={SIGNED_IN}>
              <T>Signed-in account</T>
            </SelectItem>
            {names.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>
    </div>
  );
}
