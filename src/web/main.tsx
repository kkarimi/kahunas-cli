import { render } from "solid-js/web";
import { WorkoutPage } from "./workout-page";
import type { WorkoutPageData } from "./types";
import "./style.css";

declare global {
  interface Window {
    __WORKOUT_DATA__?: WorkoutPageData;
  }
}

const data = window.__WORKOUT_DATA__;
const root = document.getElementById("app");

if (root && data) {
  const programTitle = data.summary?.program?.title ?? "Program";
  document.title = `${programTitle} | Workout`;
  render(() => <WorkoutPage {...data} />, root);
} else if (root) {
  root.textContent = "Unable to load workout data.";
}
