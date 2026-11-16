// Free, legally streamable movies (Blender Foundation open movies, Creative Commons).
// MX Player's website now redirects to Prime Video (DRM protected), so it can no longer be scraped.
// Add your own entries here, or drop .mp4 / .webm files into public/videos/.

const GOOGLE_SAMPLES = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample';

const catalog = [
    {
        id: 'big-buck-bunny-hls',
        title: 'Big Buck Bunny (HLS stream)',
        description: 'A giant rabbit takes revenge on three bullying rodents. Streamed as M3U8 / HLS.',
        year: 2008,
        thumb: `${GOOGLE_SAMPLES}/images/BigBuckBunny.jpg`,
        src: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        credit: '(c) Blender Foundation, CC BY 3.0'
    },
    {
        id: 'tears-of-steel-hls',
        title: 'Tears of Steel (HLS stream)',
        description: 'Sci-fi short: a group of warriors and scientists try to save the world from robots. Streamed as M3U8 / HLS.',
        year: 2012,
        thumb: `${GOOGLE_SAMPLES}/images/TearsOfSteel.jpg`,
        src: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
        credit: '(c) Blender Foundation, CC BY 3.0'
    },
    {
        id: 'sintel',
        title: 'Sintel',
        description: 'A lonely girl searches for the baby dragon she befriended.',
        year: 2010,
        thumb: `${GOOGLE_SAMPLES}/images/Sintel.jpg`,
        src: `${GOOGLE_SAMPLES}/Sintel.mp4`,
        credit: '(c) Blender Foundation, CC BY 3.0'
    },
    {
        id: 'big-buck-bunny',
        title: 'Big Buck Bunny',
        description: 'A giant rabbit takes revenge on three bullying rodents.',
        year: 2008,
        thumb: `${GOOGLE_SAMPLES}/images/BigBuckBunny.jpg`,
        src: `${GOOGLE_SAMPLES}/BigBuckBunny.mp4`,
        credit: '(c) Blender Foundation, CC BY 3.0'
    },
    {
        id: 'tears-of-steel',
        title: 'Tears of Steel',
        description: 'Sci-fi short: a group of warriors and scientists try to save the world from robots.',
        year: 2012,
        thumb: `${GOOGLE_SAMPLES}/images/TearsOfSteel.jpg`,
        src: `${GOOGLE_SAMPLES}/TearsOfSteel.mp4`,
        credit: '(c) Blender Foundation, CC BY 3.0'
    },
    {
        id: 'elephants-dream',
        title: 'Elephants Dream',
        description: 'Two men explore a strange, ever-changing machine world.',
        year: 2006,
        thumb: `${GOOGLE_SAMPLES}/images/ElephantsDream.jpg`,
        src: `${GOOGLE_SAMPLES}/ElephantsDream.mp4`,
        credit: '(c) Blender Foundation, CC BY 2.5'
    }
];

export default catalog;
