"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  AdminWardrobeItemDraft,
  AdminWardrobeCategory,
  AdminWardrobeEquipSlot,
  AdminWardrobeRarity,
} from "@bare-traen/api-client";

import type { AssistantWardrobeItem } from "../assistant-request";
import {
  createAdminWardrobeItemDraft,
  decideAdminWardrobeItemDraft,
  updateAdminWardrobeItemDraft,
  type WardrobeItemState,
} from "./actions";
import styles from "./page.module.css";
import {
  wardrobeSuggestionSnapshot,
  wardrobeSnapshotHasChanges,
  type WardrobeEditorSnapshot,
} from "./workspace-ux";

type WardrobeAuthoringProps = {
  initialItems: AdminWardrobeItemDraft[];
  onAnnouncement: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
  onClearNavigationWarning: () => void;
  onContinue: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onItemsChange: (items: AdminWardrobeItemDraft[]) => void;
  onOpenAssistant: () => void;
  requestId: string;
  suggestions: AssistantWardrobeItem[];
  topicId: string;
};

type EditorMode = "create" | "edit";
type UnlockMode = "points" | "rule";

const initialWardrobeItemState: WardrobeItemState = { status: "idle" };

const categoryLabels: Record<AdminWardrobeCategory, string> = {
  clothing: "Tøj",
  equipment: "Udstyr",
  effect: "Effekt",
};

const rarityLabels: Record<AdminWardrobeRarity, string> = {
  common: "Almindelig",
  rare: "Sjælden",
  special: "Særlig",
};

const equipSlotLabels: Record<AdminWardrobeEquipSlot, string> = {
  head: "På hovedet",
  body: "På kroppen",
  held: "I hånden",
  feet: "På fødderne (ét par)",
  accessory: "Tilbehør",
};

const statusLabels: Record<AdminWardrobeItemDraft["editorialStatus"], string> =
  {
    draft: "Kladde",
    approved: "Godkendt",
    rejected: "Afvist",
  };

function itemStatusLabel(item: AdminWardrobeItemDraft): string {
  if (item.status === "published" && !item.hasPendingRevision) {
    return "Publiceret";
  }

  return statusLabels[item.editorialStatus];
}

function itemCanBeReviewed(item: AdminWardrobeItemDraft): boolean {
  return item.status === "draft" || item.hasPendingRevision;
}

function emptySnapshot(): WardrobeEditorSnapshot {
  return {
    category: "clothing",
    editorialNote: "",
    equipSlot: "",
    icon: "✨",
    name: "",
    points: "100",
    rarity: "common",
    unlockMode: "points",
    unlockRule: "",
  };
}

function itemSnapshot(item: AdminWardrobeItemDraft): WardrobeEditorSnapshot {
  return {
    category: item.category,
    editorialNote: item.editorialNote,
    equipSlot: item.equipSlot,
    icon: item.icon,
    name: item.name,
    points: item.points > 0 ? item.points.toString() : "0",
    rarity: item.rarity,
    unlockMode: item.points > 0 ? "points" : "rule",
    unlockRule: item.unlockRule,
  };
}

function sortItems(items: AdminWardrobeItemDraft[]): AdminWardrobeItemDraft[] {
  return [...items].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
  );
}

function upsertItem(
  items: AdminWardrobeItemDraft[],
  item: AdminWardrobeItemDraft,
): AdminWardrobeItemDraft[] {
  return sortItems([
    ...items.filter((candidate) => candidate.id !== item.id),
    item,
  ]);
}

export function WardrobeAuthoring({
  initialItems,
  onAnnouncement,
  onBusyChange,
  onClearNavigationWarning,
  onContinue,
  onDirtyChange,
  onItemsChange,
  onOpenAssistant,
  requestId,
  suggestions,
  topicId,
}: WardrobeAuthoringProps) {
  const [createState, createAction, createPending] = useActionState(
    createAdminWardrobeItemDraft,
    initialWardrobeItemState,
  );
  const [updateState, updateAction, updatePending] = useActionState(
    updateAdminWardrobeItemDraft,
    initialWardrobeItemState,
  );
  const [decisionState, decisionAction, decisionPending] = useActionState(
    decideAdminWardrobeItemDraft,
    initialWardrobeItemState,
  );
  const [items, setItems] = useState(() => sortItems(initialItems));
  const [editorMode, setEditorMode] = useState<EditorMode | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [nextRequestId, setNextRequestId] = useState(requestId);
  const [savedSnapshot, setSavedSnapshot] =
    useState<WardrobeEditorSnapshot | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("✨");
  const [category, setCategory] = useState<AdminWardrobeCategory>("clothing");
  const [equipSlot, setEquipSlot] = useState<AdminWardrobeEquipSlot | "">("");
  const [rarity, setRarity] = useState<AdminWardrobeRarity>("common");
  const [points, setPoints] = useState("100");
  const [unlockMode, setUnlockMode] = useState<UnlockMode>("points");
  const [unlockRule, setUnlockRule] = useState("");
  const [editorialNote, setEditorialNote] = useState("");
  const [createSubmitted, setCreateSubmitted] = useState(false);
  const [updateSubmitted, setUpdateSubmitted] = useState(false);
  const [decisionSubmitted, setDecisionSubmitted] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const itemsRef = useRef(items);
  const handledCreateState = useRef<WardrobeItemState>(
    initialWardrobeItemState,
  );
  const handledUpdateState = useRef<WardrobeItemState>(
    initialWardrobeItemState,
  );
  const handledDecisionState = useRef<WardrobeItemState>(
    initialWardrobeItemState,
  );
  const editorRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const currentSnapshot: WardrobeEditorSnapshot = {
    category,
    editorialNote,
    equipSlot,
    icon,
    name,
    points,
    rarity,
    unlockMode,
    unlockRule,
  };
  const dirty =
    editorMode !== null &&
    wardrobeSnapshotHasChanges(currentSnapshot, savedSnapshot);
  const busy = createPending || updatePending || decisionPending;
  const activeState = editorMode === "edit" ? updateState : createState;
  const activeStateIsVisible =
    editorMode === "edit" ? updateSubmitted : createSubmitted;
  const fieldErrors =
    activeStateIsVisible && activeState.status === "invalid"
      ? activeState.fieldErrors
      : {};
  const editingItem = editingItemId
    ? (items.find((item) => item.id === editingItemId) ?? null)
    : null;
  const nextSortOrder = useMemo(() => {
    const highest = items.reduce(
      (current, item) => Math.max(current, item.sortOrder),
      -1,
    );
    return Math.min(highest + 1, 2_147_483_647);
  }, [items]);
  const savedNames = useMemo(
    () => new Set(items.map((item) => item.name.toLocaleLowerCase("da-DK"))),
    [items],
  );

  const replaceItems = useCallback(
    (next: AdminWardrobeItemDraft[]) => {
      const sorted = sortItems(next);
      itemsRef.current = sorted;
      setItems(sorted);
      onItemsChange(sorted);
    },
    [onItemsChange],
  );

  function applySnapshot(snapshot: WardrobeEditorSnapshot) {
    setName(snapshot.name);
    setIcon(snapshot.icon);
    setCategory(snapshot.category);
    setEquipSlot(snapshot.equipSlot);
    setRarity(snapshot.rarity);
    setPoints(snapshot.points);
    setUnlockMode(snapshot.unlockMode);
    setUnlockRule(snapshot.unlockRule);
    setEditorialNote(snapshot.editorialNote);
  }

  function focusEditor() {
    window.requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      nameRef.current?.focus({ preventScroll: true });
    });
  }

  function startCreating(snapshot = emptySnapshot()) {
    setEditorMode("create");
    setEditingItemId(null);
    setNextRequestId(window.crypto.randomUUID());
    setSavedSnapshot(emptySnapshot());
    applySnapshot(snapshot);
    setCreateSubmitted(false);
    setUpdateSubmitted(false);
    setDecisionSubmitted(false);
    setResultMessage(null);
    onClearNavigationWarning();
    focusEditor();
  }

  function startEditing(item: AdminWardrobeItemDraft) {
    const snapshot = itemSnapshot(item);
    setEditorMode("edit");
    setEditingItemId(item.id);
    setSavedSnapshot(snapshot);
    applySnapshot(snapshot);
    setCreateSubmitted(false);
    setUpdateSubmitted(false);
    setDecisionSubmitted(false);
    setResultMessage(null);
    onClearNavigationWarning();
    focusEditor();
  }

  function cancelEditing() {
    if (savedSnapshot) applySnapshot(savedSnapshot);
    setEditorMode(null);
    setEditingItemId(null);
    setSavedSnapshot(null);
    setCreateSubmitted(false);
    setUpdateSubmitted(false);
    setDecisionSubmitted(false);
    setResultMessage(null);
    onClearNavigationWarning();
    onAnnouncement(
      "Ændringerne i garderobeformularen er annulleret. Ingen gemte ting er ændret.",
    );
  }

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);

  useEffect(() => {
    if (createState === handledCreateState.current) return;
    handledCreateState.current = createState;
    if (createState.status !== "success") return;

    replaceItems(upsertItem(itemsRef.current, createState.item));
    setEditorMode(null);
    setEditingItemId(null);
    setSavedSnapshot(null);
    setCreateSubmitted(false);
    setNextRequestId(window.crypto.randomUUID());
    setResultMessage(createState.message);
    onDirtyChange(false);
    onAnnouncement(createState.message);
  }, [createState, onAnnouncement, onDirtyChange, replaceItems]);

  useEffect(() => {
    if (updateState === handledUpdateState.current) return;
    handledUpdateState.current = updateState;
    if (updateState.status !== "success") return;

    replaceItems(upsertItem(itemsRef.current, updateState.item));
    setEditorMode(null);
    setEditingItemId(null);
    setSavedSnapshot(null);
    setUpdateSubmitted(false);
    setResultMessage(updateState.message);
    onDirtyChange(false);
    onAnnouncement(updateState.message);
  }, [onAnnouncement, onDirtyChange, replaceItems, updateState]);

  useEffect(() => {
    if (decisionState === handledDecisionState.current) return;
    handledDecisionState.current = decisionState;
    if (decisionState.status !== "success") return;

    replaceItems(upsertItem(itemsRef.current, decisionState.item));
    setDecisionSubmitted(false);
    setResultMessage(decisionState.message);
    onAnnouncement(decisionState.message);
  }, [decisionState, onAnnouncement, replaceItems]);

  useEffect(() => {
    if (!activeStateIsVisible || activeState.status !== "invalid") return;
    const frame = window.requestAnimationFrame(() => {
      editorRef.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeState, activeStateIsVisible]);

  return (
    <div className={styles.stepContent}>
      <div className={styles.stepIntro}>
        <p className={styles.eyebrow}>Gemte belønninger</p>
        <h3>Byg garderoben til emnet</h3>
        <p>
          Opret ting manuelt, eller brug et AI-forslag som udgangspunkt. Intet
          gemmes, før du vælger Gem som kladde, og hvert gemt element skal
          godkendes af dig før den senere publicering.
        </p>
        <div className={styles.inlineActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onOpenAssistant}
          >
            Få forslag fra AI
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={busy || dirty}
            onClick={() => startCreating()}
          >
            Opret garderobeting
          </button>
        </div>
      </div>

      {suggestions.length > 0 ? (
        <section
          className={styles.wardrobeSuggestions}
          aria-labelledby="wardrobe-suggestions-title"
        >
          <header>
            <div>
              <p className={styles.eyebrow}>AI-forslag · ikke gemt</p>
              <h3 id="wardrobe-suggestions-title">Idéer til garderoben</h3>
            </div>
            <span>{suggestions.length} forslag</span>
          </header>
          <div className={styles.wardrobeGrid}>
            {suggestions.map((item, index) => {
              const alreadySaved = savedNames.has(
                item.name.toLocaleLowerCase("da-DK"),
              );
              return (
                <article
                  className={styles.wardrobeCard}
                  key={`${item.name}-${index}`}
                >
                  <span className={styles.wardrobeIcon} aria-hidden="true">
                    {item.icon}
                  </span>
                  <strong>{item.name}</strong>
                  <small>
                    {categoryLabels[item.category]} ·{" "}
                    {rarityLabels[item.rarity]} ·{" "}
                    {equipSlotLabels[item.equipSlot]}
                  </small>
                  <p>
                    {item.points > 0 ? `${item.points} point` : item.unlockRule}
                  </p>
                  <p>{item.reason}</p>
                  <button
                    type="button"
                    className={styles.cardButton}
                    disabled={alreadySaved || busy || dirty}
                    onClick={() =>
                      startCreating(wardrobeSuggestionSnapshot(item))
                    }
                  >
                    {alreadySaved ? "Allerede gemt" : "Brug forslag"}
                  </button>
                </article>
              );
            })}
          </div>
          <p className={styles.wardrobeDisclaimer}>
            Brug forslag åbner en redigerbar formular. Forslaget er stadig ikke
            gemt, før du aktivt vælger Gem som kladde.
          </p>
        </section>
      ) : null}

      <section
        className={styles.savedWardrobeSection}
        aria-labelledby="saved-wardrobe-title"
      >
        <header>
          <div>
            <p className={styles.eyebrow}>Garderobeting</p>
            <h3 id="saved-wardrobe-title">Gemte garderobeting</h3>
          </div>
          <span>{items.length} gemt</span>
        </header>
        {items.length === 0 ? (
          <p className={styles.emptyWardrobeMessage}>
            Der er endnu ikke gemt noget til dette emne. Opret et element
            manuelt, eller hent et AI-forslag og tilpas det først.
          </p>
        ) : (
          <div className={styles.savedWardrobeList}>
            {items.map((item) => (
              <article key={item.id} className={styles.savedWardrobeItem}>
                <span className={styles.wardrobeIcon} aria-hidden="true">
                  {item.icon}
                </span>
                <div className={styles.savedWardrobeBody}>
                  <div className={styles.savedWardrobeHeading}>
                    <strong>{item.name}</strong>
                    <span
                      className={`${styles.editorialBadge} ${styles[`editorialBadge_${item.editorialStatus}`]}`}
                    >
                      {itemStatusLabel(item)}
                    </span>
                  </div>
                  <small>
                    {categoryLabels[item.category]} ·{" "}
                    {rarityLabels[item.rarity]} ·{" "}
                    {equipSlotLabels[item.equipSlot]}
                  </small>
                  <p>
                    {item.points > 0 ? `${item.points} point` : item.unlockRule}
                  </p>
                  {item.editorialNote ? <p>{item.editorialNote}</p> : null}
                </div>
                <div className={styles.wardrobeItemActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={busy || dirty}
                    onClick={() => startEditing(item)}
                  >
                    Rediger
                  </button>
                  {itemCanBeReviewed(item) &&
                  item.editorialStatus !== "approved" ? (
                    <form
                      action={decisionAction}
                      onSubmit={() => {
                        setCreateSubmitted(false);
                        setUpdateSubmitted(false);
                        setDecisionSubmitted(true);
                        setResultMessage(null);
                        onBusyChange(true);
                      }}
                    >
                      <input type="hidden" name="itemId" value={item.id} />
                      <input type="hidden" name="topicId" value={topicId} />
                      <input
                        type="hidden"
                        name="expectedUpdatedAt"
                        value={item.updatedAt}
                      />
                      <input type="hidden" name="decision" value="approved" />
                      <button
                        type="submit"
                        className={styles.primaryButton}
                        disabled={busy || dirty}
                      >
                        Godkend
                      </button>
                    </form>
                  ) : null}
                  {itemCanBeReviewed(item) &&
                  item.editorialStatus !== "rejected" ? (
                    <form
                      action={decisionAction}
                      onSubmit={() => {
                        setCreateSubmitted(false);
                        setUpdateSubmitted(false);
                        setDecisionSubmitted(true);
                        setResultMessage(null);
                        onBusyChange(true);
                      }}
                    >
                      <input type="hidden" name="itemId" value={item.id} />
                      <input type="hidden" name="topicId" value={topicId} />
                      <input
                        type="hidden"
                        name="expectedUpdatedAt"
                        value={item.updatedAt}
                      />
                      <input type="hidden" name="decision" value="rejected" />
                      <button
                        type="submit"
                        className={styles.tertiaryDangerButton}
                        disabled={busy || dirty}
                      >
                        Afvis
                      </button>
                    </form>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {editorMode ? (
        <section
          ref={editorRef}
          className={styles.wardrobeEditor}
          aria-labelledby="wardrobe-editor-title"
        >
          <header>
            <div>
              <p className={styles.eyebrow}>
                {editorMode === "edit" ? "Rediger gemt kladde" : "Ny kladde"}
              </p>
              <h3 id="wardrobe-editor-title">
                {editorMode === "edit"
                  ? `Rediger ${editingItem?.name ?? "garderobeting"}`
                  : "Tilpas garderobetinget før du gemmer"}
              </h3>
            </div>
            <span>
              {editingItem?.status === "published"
                ? "Live version bevares"
                : "Ikke publiceret"}
            </span>
          </header>
          <form
            action={editorMode === "edit" ? updateAction : createAction}
            className={styles.draftForm}
            noValidate
            onChange={() => {
              if (editorMode === "edit") setUpdateSubmitted(false);
              else setCreateSubmitted(false);
              setResultMessage(null);
              onClearNavigationWarning();
            }}
            onSubmit={() => {
              if (editorMode === "edit") {
                setCreateSubmitted(false);
                setUpdateSubmitted(true);
              } else {
                setCreateSubmitted(true);
                setUpdateSubmitted(false);
              }
              setDecisionSubmitted(false);
              setResultMessage(null);
              onClearNavigationWarning();
              onBusyChange(true);
            }}
          >
            <input
              type="hidden"
              name="requestId"
              value={
                editorMode === "edit" ? (editingItemId ?? "") : nextRequestId
              }
            />
            <input type="hidden" name="topicId" value={topicId} />
            <input
              type="hidden"
              name="sortOrder"
              value={
                editorMode === "edit"
                  ? (editingItem?.sortOrder ?? 0)
                  : nextSortOrder
              }
            />
            {editorMode === "edit" ? (
              <input
                type="hidden"
                name="expectedUpdatedAt"
                value={editingItem?.updatedAt ?? ""}
              />
            ) : null}
            <div className={styles.fieldGrid}>
              <label className={styles.iconField}>
                <span>Ikon</span>
                <input
                  name="icon"
                  maxLength={16}
                  value={icon}
                  disabled={busy}
                  aria-invalid={Boolean(fieldErrors.icon)}
                  onChange={(event) => setIcon(event.target.value)}
                />
                {fieldErrors.icon ? <small>{fieldErrors.icon}</small> : null}
              </label>
              <label className={styles.titleField}>
                <span>Navn</span>
                <input
                  ref={nameRef}
                  name="name"
                  maxLength={80}
                  required
                  value={name}
                  disabled={busy}
                  aria-invalid={Boolean(fieldErrors.name)}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Fx Regnbuebold"
                />
                {fieldErrors.name ? <small>{fieldErrors.name}</small> : null}
              </label>
            </div>
            <div className={styles.formGrid}>
              <label>
                <span>Type</span>
                <select
                  name="category"
                  value={category}
                  disabled={busy}
                  aria-invalid={Boolean(fieldErrors.category)}
                  onChange={(event) =>
                    setCategory(event.target.value as AdminWardrobeCategory)
                  }
                >
                  <option value="clothing">Tøj</option>
                  <option value="equipment">Udstyr</option>
                  <option value="effect">Effekt</option>
                </select>
                {fieldErrors.category ? (
                  <small>{fieldErrors.category}</small>
                ) : null}
              </label>
              <label>
                <span>Placering på barnet</span>
                <select
                  name="equipSlot"
                  required
                  value={equipSlot}
                  disabled={busy}
                  aria-invalid={Boolean(fieldErrors.equipSlot)}
                  onChange={(event) =>
                    setEquipSlot(
                      event.target.value as AdminWardrobeEquipSlot | "",
                    )
                  }
                >
                  <option value="">Vælg placering</option>
                  <option value="head">På hovedet</option>
                  <option value="body">På kroppen</option>
                  <option value="held">I hånden</option>
                  <option value="feet">På fødderne (ét helt par sko)</option>
                  <option value="accessory">Tilbehør</option>
                </select>
                {fieldErrors.equipSlot ? (
                  <small>{fieldErrors.equipSlot}</small>
                ) : (
                  <span className={styles.helpText}>
                    Barnet kan kun have én ting i hver placering ad gangen.
                  </span>
                )}
              </label>
              <label>
                <span>Sjældenhed</span>
                <select
                  name="rarity"
                  value={rarity}
                  disabled={busy}
                  aria-invalid={Boolean(fieldErrors.rarity)}
                  onChange={(event) =>
                    setRarity(event.target.value as AdminWardrobeRarity)
                  }
                >
                  <option value="common">Almindelig</option>
                  <option value="rare">Sjælden</option>
                  <option value="special">Særlig</option>
                </select>
                {fieldErrors.rarity ? (
                  <small>{fieldErrors.rarity}</small>
                ) : null}
              </label>
              <fieldset className={styles.unlockFieldset}>
                <legend>Sådan låses tinget op</legend>
                <div className={styles.unlockChoice}>
                  <label>
                    <input
                      type="radio"
                      name="unlockMode"
                      value="points"
                      checked={unlockMode === "points"}
                      disabled={busy}
                      onChange={() => {
                        setUnlockMode("points");
                        setUnlockRule("");
                        if (points === "0") setPoints("100");
                      }}
                    />
                    Pointpris
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="unlockMode"
                      value="rule"
                      checked={unlockMode === "rule"}
                      disabled={busy}
                      onChange={() => {
                        setUnlockMode("rule");
                        setPoints("0");
                      }}
                    />
                    Oplåsningsregel
                  </label>
                </div>
                {unlockMode === "points" ? (
                  <label>
                    <span>Point</span>
                    <input
                      name="points"
                      type="number"
                      min={1}
                      max={1000}
                      step={1}
                      value={points}
                      disabled={busy}
                      aria-invalid={Boolean(fieldErrors.points)}
                      onChange={(event) => setPoints(event.target.value)}
                    />
                    <input type="hidden" name="unlockRule" value="" />
                    {fieldErrors.points ? (
                      <small>{fieldErrors.points}</small>
                    ) : null}
                  </label>
                ) : (
                  <label>
                    <span>Regel</span>
                    <input type="hidden" name="points" value="0" />
                    <input
                      name="unlockRule"
                      maxLength={200}
                      value={unlockRule}
                      disabled={busy}
                      aria-invalid={Boolean(fieldErrors.unlockRule)}
                      onChange={(event) => setUnlockRule(event.target.value)}
                      placeholder="Fx Gennemfør tre deløvelser"
                    />
                    {fieldErrors.unlockRule ? (
                      <small>{fieldErrors.unlockRule}</small>
                    ) : null}
                  </label>
                )}
              </fieldset>
              <label className={styles.fullField}>
                <span>Redaktionel note</span>
                <textarea
                  name="editorialNote"
                  rows={3}
                  maxLength={300}
                  value={editorialNote}
                  disabled={busy}
                  aria-invalid={Boolean(fieldErrors.editorialNote)}
                  onChange={(event) => setEditorialNote(event.target.value)}
                  placeholder="Hvorfor passer tinget til emnet?"
                />
                {fieldErrors.editorialNote ? (
                  <small>{fieldErrors.editorialNote}</small>
                ) : (
                  <span className={styles.helpText}>
                    Noten er kun til redaktionen og bliver ikke vist for barnet.
                  </span>
                )}
              </label>
            </div>
            {activeStateIsVisible && activeState.status !== "idle" ? (
              <p
                className={
                  activeState.status === "success"
                    ? styles.successMessage
                    : styles.errorMessage
                }
                role={activeState.status === "success" ? "status" : "alert"}
              >
                {activeState.message}
              </p>
            ) : null}
            <div className={styles.draftFooter}>
              <p className={styles.idleMessage}>
                {editorMode === "edit"
                  ? editingItem?.status === "published"
                    ? "Ændringen gemmes som kladde. Den nuværende publicerede version vises, indtil kladden godkendes og publiceres."
                    : "En indholdsændring sætter status tilbage til Kladde."
                  : "Gemmer kun dette element som en upubliceret kladde."}
              </p>
              <div className={styles.inlineActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={busy}
                  onClick={cancelEditing}
                >
                  Annuller
                </button>
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={
                    busy ||
                    !name.trim() ||
                    !icon.trim() ||
                    !equipSlot ||
                    (editorMode === "edit" && !dirty)
                  }
                >
                  {busy
                    ? "Gemmer…"
                    : editorMode === "edit"
                      ? "Gem ændringer"
                      : "Gem som kladde"}
                </button>
              </div>
            </div>
          </form>
        </section>
      ) : null}

      {decisionSubmitted && decisionState.status !== "idle" ? (
        <p
          className={
            decisionState.status === "success"
              ? styles.successMessage
              : styles.errorMessage
          }
          role={decisionState.status === "success" ? "status" : "alert"}
        >
          {decisionState.message}
        </p>
      ) : null}
      {resultMessage ? (
        <p className={styles.successMessage} role="status">
          {resultMessage}
        </p>
      ) : null}

      <div className={styles.draftFooter}>
        <p className={styles.idleMessage}>
          {items.filter((item) => item.editorialStatus === "approved").length}{" "}
          af {items.length} gemte ting er godkendt. Publicering sker først i det
          samlede emneflow.
        </p>
        <button
          className={styles.primaryButton}
          type="button"
          disabled={dirty || busy}
          onClick={onContinue}
        >
          Gå til gennemgang
        </button>
      </div>
    </div>
  );
}
