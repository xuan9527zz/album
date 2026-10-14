import { ZinePlayer } from "./ZineStudio";
import { FileAudioPlayer } from "./FileAudioPlayer";
import { newZineConfig, type ZinePhoto } from "../../../packages/zine/src";
import "./story.css";
import "./story-tools.css";

const audio = `${import.meta.env.BASE_URL}music/whenever.mp3`;
const palettes = [
  ["#c6dfd8", "#437974"],
  ["#eee2cc", "#8e938a"],
  ["#dacfc3", "#8c7978"],
  ["#ccd9c8", "#607964"],
  ["#ccdae4", "#607b93"],
];
const photos: ZinePhoto[] = palettes.map((_, index) => ({
  id: `trial-photo-${index}`,
  title: `音乐试播 · ${index + 1}`,
  captured_local: null,
  location_label: null,
}));
const story = {
  id: "music-trial",
  title: "Whenever · 影集试播",
  template: "zine-diary" as const,
  transition: "slide",
  is_owner: false,
  photos,
  zine_config: newZineConfig(photos, "zine-diary"),
};

export default function HostedMusicTrial() {
  return (
    <main className="hosted-music-trial">
      <ZinePlayer
        story={story}
        publicView
        toolbar={
          <FileAudioPlayer
            source={audio}
            title="Whenever"
            subtitle="林俊杰 · 在线试播"
            expectedBytes={9970460}
          />
        }
        renderPhoto={(photo) => {
          const index = photos.findIndex((p) => p.id === photo.id),
            [paper, ink] = palettes[index];
          return (
            <svg
              className="music-trial-art"
              viewBox="0 0 900 1100"
              preserveAspectRatio="xMidYMid slice"
              role="img"
              aria-label="试播示意图"
            >
              <rect width="900" height="1100" fill={paper} />
              <circle cx="690" cy="235" r="72" fill="#fbdfb0" />
              <path
                d="M0 750Q250 420 460 730T900 650V1100H0Z"
                fill={ink}
                opacity=".45"
              />
              <path d="M0 960Q280 650 530 940T900 880V1100H0Z" fill={ink} />
            </svg>
          );
        }}
      />
    </main>
  );
}
