import styles from "./Game.module.css";
import GameCanvas from "./GameCanvas";
import GameUI from "./GameUI";

function App() {
  return (
    <div class={styles.appRoot}>
      <GameCanvas />
      <GameUI />
    </div>
  );
}

export default App;
