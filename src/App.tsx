import styles from "./Game.module.css";
import GameCanvas from "./GameCanvas";

function App() {
  return (
    <div class={styles.appRoot}>
      <GameCanvas />
    </div>
  );
}

export default App;
