import {
  addProjectRemoteSourceProvider,
  type AddProjectRemoteSource,
  type NewProjectPublishTarget,
} from "@t3tools/client-runtime/operations/projects";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import {
  type EnvironmentId,
  SOURCE_CONTROL_REPOSITORY_SEARCH_QUERY_MAX_LENGTH,
  type SourceControlProviderKind,
  type SourceControlRepositoryInfo,
} from "@t3tools/contracts";
import { FolderGit2Icon, LinkIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

import { useDebouncedValue } from "~/state/queries";
import { useEnvironmentQuery } from "~/state/query";
import { sourceControlEnvironment } from "~/state/sourceControl";
import { sourceControlIcon } from "~/sourceControlPresentation";
import {
  ITEM_ICON_CLASS,
  canSearchRepositories,
  visibleRepositorySuggestions,
} from "./CommandPalette.logic";
import { CommandPaletteTitleIcon } from "./CommandPaletteResults";
import { Button } from "./ui/button";
import { Kbd, KbdGroup } from "./ui/kbd";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "./ui/select";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

export function remoteProjectSourceIcon(
  source: AddProjectRemoteSource,
  className: string,
): ReactNode {
  if (source === "url") return <LinkIcon className={className} />;
  const Icon = sourceControlIcon(sourceControlClients.get(source));
  return <Icon className={className} />;
}

export function sourceControlHostIcon(
  definition: NewProjectPublishTarget["definition"],
  className: string,
): ReactNode {
  const Icon = sourceControlIcon(definition);
  return <Icon className={className} />;
}

const REPOSITORY_SEARCH_DEBOUNCE_MS = 180;

/**
 * Repositories the host finds for a partly typed name. While a newer search runs, the last
 * results that still fit the query stay, so the list neither blinks nor shows misses.
 */
export function useRepositorySuggestions(
  environmentId: EnvironmentId | null,
  source: AddProjectRemoteSource | null,
  query: string,
): {
  readonly repositories: ReadonlyArray<SourceControlRepositoryInfo>;
  readonly isPending: boolean;
} {
  const provider = source === null ? null : addProjectRemoteSourceProvider(source);
  const searchable =
    environmentId !== null &&
    provider !== null &&
    sourceControlClients.find(provider)?.repositorySearch === true;
  const scopeKey = searchable ? `${environmentId}\n${provider}` : null;
  const searchText = searchable
    ? query.trim().slice(0, SOURCE_CONTROL_REPOSITORY_SEARCH_QUERY_MAX_LENGTH).trim()
    : "";
  const debouncedText = useDebouncedValue(searchText, REPOSITORY_SEARCH_DEBOUNCE_MS);
  const canSearch = canSearchRepositories(searchText);
  const settledQuery = canSearch && debouncedText === searchText ? searchText : null;
  const search = useEnvironmentQuery(
    environmentId === null || provider === null || settledQuery === null
      ? null
      : sourceControlEnvironment.searchRepositories({
          environmentId,
          input: { provider, query: settledQuery },
        }),
  );
  // A failed search stays silent; the lookup on Enter reports its own error.
  const latest = settledQuery !== null && search.isSuccess ? search.data : null;
  const [previous, setPrevious] = useState<{
    readonly scopeKey: string | null;
    readonly repositories: ReadonlyArray<SourceControlRepositoryInfo>;
  } | null>(null);
  // Kept from earlier renders: React's pattern for information from previous renders.
  if (
    latest !== null &&
    latest.length > 0 &&
    (previous?.repositories !== latest || previous.scopeKey !== scopeKey)
  ) {
    setPrevious({ scopeKey, repositories: latest });
  }
  const repositories = visibleRepositorySuggestions(
    searchText,
    latest,
    previous?.scopeKey === scopeKey ? previous.repositories : null,
  );
  return {
    repositories,
    isPending:
      canSearch && repositories.length === 0 && (debouncedText !== searchText || search.isPending),
  };
}

/** The input's trailing submit button for the add-project, clone, and new-project flows. */
export function CommandPaletteSubmitButton(props: {
  readonly id: string;
  readonly label: ReactNode;
  readonly shortcutLabel: string;
  readonly ariaLabel: string;
  readonly tooltip: ReactNode;
  readonly disabled: boolean;
  readonly onSubmit: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            id={props.id}
            variant="outline"
            size="xs"
            className="absolute inset-e-2.5 top-1/2 -translate-y-1/2"
            aria-label={props.ariaLabel}
            disabled={props.disabled}
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={props.onSubmit}
          />
        }
      >
        <span>{props.label}</span>
        <KbdGroup className="pointer-events-none -me-0.5">
          <Kbd>{props.shortcutLabel}</Kbd>
        </KbdGroup>
      </TooltipTrigger>
      <TooltipPopup side="top">{props.tooltip}</TooltipPopup>
    </Tooltip>
  );
}

/**
 * Picks which host a new project publishes to. The row it sits in toggles on click, so the
 * picker keeps its clicks to itself. The row also cancels pointerdown to keep focus in the
 * input, which drops the mousedown Select opens on, so the picker opens on click instead.
 */
export function NewProjectPublishHostPicker(props: {
  readonly disabled: boolean;
  readonly targets: ReadonlyArray<NewProjectPublishTarget>;
  readonly value: SourceControlProviderKind;
  readonly onValueChange: (kind: SourceControlProviderKind) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="flex"
      onClick={(event) => {
        event.stopPropagation();
        // React bubbles the popup's clicks here through its portal; only the
        // trigger opens the picker.
        if (!event.currentTarget.contains(event.target as Node)) return;
        if (!props.disabled) setOpen(true);
      }}
    >
      <Select
        disabled={props.disabled}
        open={open}
        onOpenChange={setOpen}
        value={props.value}
        onValueChange={(kind) => {
          if (kind !== null) props.onValueChange(kind);
        }}
      >
        <SelectTrigger size="xs" variant="ghost" aria-label="Host for the new repository">
          <SelectValue>
            {(kind: SourceControlProviderKind) => sourceControlClients.get(kind).label}
          </SelectValue>
        </SelectTrigger>
        <SelectPopup align="end" alignItemWithTrigger={false}>
          {props.targets.map((target) => (
            <SelectItem key={target.definition.kind} hideIndicator value={target.definition.kind}>
              <span className="inline-flex items-center gap-1.5">
                {sourceControlHostIcon(target.definition, "size-3.5")}
                {target.definition.label}
              </span>
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </span>
  );
}

export function NewProjectSummary(props: {
  readonly name: string;
  readonly pathPreview: string;
  readonly projectsRoot: string | null;
  readonly environmentLabel: string | null;
}) {
  return (
    <div className="p-2 pb-0">
      <div className="flex min-h-8 items-center gap-2 rounded-sm px-2 py-1.5">
        <CommandPaletteTitleIcon>
          <FolderGit2Icon className={ITEM_ICON_CLASS} />
        </CommandPaletteTitleIcon>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-foreground text-sm">
            {props.name.length > 0 ? props.name : "New project"}
          </span>
          <span className="truncate text-muted-foreground/85 text-xs">
            {props.name.length > 0
              ? `Creates ${props.pathPreview}`
              : `Goes in ${props.projectsRoot}`}
            {props.environmentLabel === null ? null : ` on ${props.environmentLabel}`}
          </span>
        </span>
      </div>
    </div>
  );
}

export function RemoteRepositorySummary(props: {
  readonly source: AddProjectRemoteSource;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div className="shrink-0 p-2 pb-0">
      <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">Repository</div>
      <div className="flex min-h-8 items-center gap-2 rounded-sm px-2 py-1.5">
        <CommandPaletteTitleIcon>
          {remoteProjectSourceIcon(props.source, ITEM_ICON_CLASS)}
        </CommandPaletteTitleIcon>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-foreground text-sm">{props.title}</span>
          <span className="truncate text-muted-foreground/85 text-xs">{props.description}</span>
        </span>
      </div>
    </div>
  );
}
