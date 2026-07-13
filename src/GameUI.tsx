import { Dialog, Switch, Tabs } from "@kobalte/core";
import Flame from "lucide-solid/icons/flame";
import Settings from "lucide-solid/icons/settings";
import Sparkles from "lucide-solid/icons/sparkles";
import X from "lucide-solid/icons/x";
import { createSignal, For, onCleanup } from "solid-js";
import * as audio from "./audio";
import styles from "./Game.module.css";
import {
  BIOMES,
  gameState,
  setAudioMuted,
  setMenuOpen,
  setReducedMotion,
  TOTAL_BRAZIERS,
  TOTAL_CRYSTALS,
} from "./gameStore";
import { persistence } from "./persistence";

// GameUI.tsx-local constant (spec/03-reference.md §2.1).
const RESET_ARMED_DURATION_MS = 4000; // ms until the armed reset button auto-disarms

function currentBiomeName(): string {
  return (
    BIOMES.find((biome) => biome.id === gameState.currentBiome)?.name ?? ""
  );
}

// A plain function (not a hoisted const) so each JSX binding re-reads the Signal —
// GameUI() itself only runs once, so a top-level `const` here would freeze at mount.
function reducedMotionAttr(): true | undefined {
  return gameState.reducedMotion || undefined;
}

function GameUI() {
  // Component-local Signal, not store state (spec/04-ui.md §3.2 — the armed state is
  // transient UI, outside the store's fixed 7-field contract).
  const [resetArmed, setResetArmed] = createSignal(false);
  let resetArmedTimer: ReturnType<typeof setTimeout> | undefined;

  function handleResetClick() {
    if (resetArmed()) {
      clearTimeout(resetArmedTimer);
      persistence.clear();
      location.reload();
      return;
    }
    setResetArmed(true);
    resetArmedTimer = setTimeout(
      () => setResetArmed(false),
      RESET_ARMED_DURATION_MS,
    );
  }

  onCleanup(() => clearTimeout(resetArmedTimer));

  function handleSoundChange(on: boolean) {
    const muted = !on;
    setAudioMuted(muted);
    persistence.setAudioMuted(muted);
    audio.setMuted(muted);
  }

  return (
    <>
      <div class={styles.hud}>
        <div class={styles.hudItem}>
          <Sparkles size={20} aria-hidden="true" class={styles.hudIcon} />
          <span class={styles.srOnly}>Crystals collected</span>
          <span class={styles.hudValue}>
            {gameState.crystalsCollected} / {TOTAL_CRYSTALS}
          </span>
        </div>
        <div class={styles.hudItem}>
          <Flame size={20} aria-hidden="true" class={styles.hudIcon} />
          <span class={styles.srOnly}>Braziers lit</span>
          <span class={styles.hudValue}>
            {gameState.litBraziersCount} / {TOTAL_BRAZIERS}
          </span>
        </div>
        <div class={`${styles.hudItem} ${styles.biomeChip}`}>
          {currentBiomeName()}
        </div>
        <button
          type="button"
          class={styles.settingsButton}
          aria-label="Settings"
          onClick={() => setMenuOpen(true)}
        >
          <Settings size={20} aria-hidden="true" />
        </button>
      </div>

      <Dialog.Root open={gameState.isMenuOpen} onOpenChange={setMenuOpen}>
        <Dialog.Portal>
          <Dialog.Overlay
            class={styles.dialogOverlay}
            data-reduced={reducedMotionAttr()}
          />
          <div class={styles.dialogPositioner}>
            <Dialog.Content
              class={styles.dialogContent}
              data-reduced={reducedMotionAttr()}
            >
              <div class={styles.dialogHeader}>
                <Dialog.Title class={styles.dialogTitle}>Menu</Dialog.Title>
                <Dialog.CloseButton
                  class={styles.dialogClose}
                  aria-label="Close menu"
                >
                  <X size={20} aria-hidden="true" />
                </Dialog.CloseButton>
              </div>
              <Tabs.Root defaultValue="journal">
                <Tabs.List class={styles.tabsList}>
                  <Tabs.Trigger class={styles.tabsTrigger} value="journal">
                    Journal
                  </Tabs.Trigger>
                  <Tabs.Trigger class={styles.tabsTrigger} value="settings">
                    Settings
                  </Tabs.Trigger>
                  <Tabs.Indicator class={styles.tabsIndicator} />
                </Tabs.List>
                <Tabs.Content class={styles.tabsContent} value="journal">
                  <ul class={styles.logList}>
                    <li class={styles.logItem}>
                      Crystals: {gameState.crystalsCollected} / {TOTAL_CRYSTALS}
                    </li>
                    <li class={styles.logItem}>
                      Braziers: {gameState.litBraziersCount} / {TOTAL_BRAZIERS}
                    </li>
                    <For each={BIOMES}>
                      {(biome) => (
                        <li
                          class={
                            biome.id === gameState.currentBiome
                              ? `${styles.logItem} ${styles.logItemFound}`
                              : styles.logItem
                          }
                        >
                          {biome.name}
                          {biome.id === gameState.currentBiome
                            ? " · current"
                            : ""}
                        </li>
                      )}
                    </For>
                  </ul>
                </Tabs.Content>
                <Tabs.Content class={styles.tabsContent} value="settings">
                  <Switch.Root
                    class={styles.switchRoot}
                    checked={gameState.reducedMotion}
                    onChange={setReducedMotion}
                  >
                    <Switch.Label class={styles.switchLabel}>
                      Reduce motion
                    </Switch.Label>
                    <Switch.Input class={styles.srOnly} />
                    <Switch.Control class={styles.switchControl}>
                      <Switch.Thumb class={styles.switchThumb} />
                    </Switch.Control>
                  </Switch.Root>
                  <Switch.Root
                    class={styles.switchRoot}
                    checked={!gameState.audioMuted}
                    onChange={handleSoundChange}
                  >
                    <Switch.Label class={styles.switchLabel}>
                      Sound
                    </Switch.Label>
                    <Switch.Input class={styles.srOnly} />
                    <Switch.Control class={styles.switchControl}>
                      <Switch.Thumb class={styles.switchThumb} />
                    </Switch.Control>
                  </Switch.Root>
                  <p>
                    Walk with arrow keys or WASD. Touch crystals to collect
                    them. Warm braziers light as you pass.
                  </p>
                  <button
                    type="button"
                    class={
                      resetArmed()
                        ? `${styles.resetButton} ${styles.resetButtonArmed}`
                        : styles.resetButton
                    }
                    onClick={handleResetClick}
                  >
                    <span aria-live="polite">
                      {resetArmed()
                        ? "Press again — your journey will start over"
                        : "Begin a new stroll"}
                    </span>
                  </button>
                </Tabs.Content>
              </Tabs.Root>
            </Dialog.Content>
          </div>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

export default GameUI;
