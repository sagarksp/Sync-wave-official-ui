import React from "react";
import NowPlaying from "./NowPlaying";
import Queue from "./Queue";

export default function Library({ playlists, onOpenPlaylists }) {
  return (
    <div className="library-page">
      <section className="library-main">
        <NowPlaying />
      </section>
      <section className="library-side">
        <div className="panel-header">
          <span className="panel-title">Library</span>
          <button className="text-action" onClick={onOpenPlaylists}>Playlists</button>
        </div>
        <div className="library-summary">
          <div>
            <strong>{playlists.length}</strong>
            <span>Playlists</span>
          </div>
          <div>
            <strong>{playlists.reduce((sum, playlist) => sum + playlist.songs.length, 0)}</strong>
            <span>Saved songs</span>
          </div>
        </div>
        <Queue />
      </section>
    </div>
  );
}
