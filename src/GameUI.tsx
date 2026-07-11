import { Dialog, Switch, Tabs } from "@kobalte/core";
import Flame from "lucide-solid/icons/flame";
import Settings from "lucide-solid/icons/settings";
import Sparkles from "lucide-solid/icons/sparkles";
import X from "lucide-solid/icons/x";
import { For } from "solid-js";
import styles from "./Game.module.css";
import {
  BIOMES,
  gameState,
  setMenuOpen,
  setReducedMotion,
  TOTAL_BRAZIERS,
  TOTAL_CRYSTALS,
} from "./gameStore";

function currentBiomeName(): string {
  return (
    BIOMES.find((biome) => biome.id === gameState.currentBiome)?.name ?? ""
  );
}

function GameUI() {
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
          <Dialog.Overlay class={styles.dialogOverlay} />
          <div class={styles.dialogPositioner}>
            <Dialog.Content class={styles.dialogContent}>
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
                  <p>
                    Walk with arrow keys or WASD. Touch crystals to collect
                    them. Warm braziers light as you pass.
                  </p>
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
