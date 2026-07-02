import React from "react";
import GamesHome from "./pages/GamesHome";
import { GamesProvider } from "./state/GamesContext";

export default function GamesModule({ auth }) {
  return (
    <GamesProvider auth={auth}>
      <GamesHome />
    </GamesProvider>
  );
}
