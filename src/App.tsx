import styles from "./Game.module.css";
import GameCanvas from "./GameCanvas";
import GameUI from "./GameUI";
import { gameState } from "./gameStore";

function App() {
  return (
    <div
      class={styles.appRoot}
      data-reduced={gameState.reducedMotion || undefined}
    >
      <GameCanvas />
      <GameUI />
    </div>
  );
}

export default App;
