export const audioTracks = [
  {
    id: "whenever",
    title: "Whenever",
    artist: "林俊杰",
    url: "https://xuan9527zz.github.io/album/music/whenever.mp3",
  },
] as const;
export const audioTrack = (id: string) =>
  audioTracks.find((track) => track.id === id);
