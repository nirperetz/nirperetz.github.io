// Every model in the gallery. Files live in public/models/<id>.glb, converted from the
// original Blender and Maya sources with headless Blender (see README.md).

export interface Entry {
  id: string;
  title: string;
  year: number;
  /** Where it was made, and in what. */
  origin: string;
  tool: "Maya" | "Blender";
  /** Shown under the title. */
  note?: string;
  /** Rotation in degrees (x, y, z), for models saved lying down. */
  turn?: [number, number, number];
}

export const CATALOG: Entry[] = [
  { id: "yona", title: "Yona", year: 2017, origin: "Bezalel final project", tool: "Maya" },
  {
    id: "yona-expressions",
    title: "Yona: blink and surprise",
    year: 2017,
    origin: "Bezalel final project",
    tool: "Maya",
    note: "Facial animation, baked from an Alembic cache to morph targets",
  },
  {
    id: "yona-print",
    title: "Yona, expressions for print",
    year: 2022,
    origin: "3D printing",
    tool: "Blender",
  },
  {
    id: "nir-head",
    title: "Self-portrait",
    year: 2016,
    origin: "Bezalel summer course",
    tool: "Maya",
  },
  {
    id: "pantomime",
    title: "Pantomime",
    year: 2021,
    origin: "Maya animation",
    tool: "Maya",
    note: "Baked from an Alembic export",
  },
  {
    id: "mani",
    title: "Mani",
    year: 2021,
    origin: "Maya animation",
    tool: "Maya",
    note: "Baked from an Alembic export",
  },
  {
    id: "whip",
    title: "Whip",
    year: 2021,
    origin: "Maya animation",
    tool: "Maya",
    note: "Baked from an Alembic export",
  },
  {
    id: "knight",
    title: "Knight",
    year: 2020,
    origin: "FridayLab",
    tool: "Blender",
    note: "Rigged and animated",
  },
  {
    id: "skin-character",
    title: "Skin character",
    year: 2020,
    origin: "FridayLab",
    tool: "Blender",
  },
  { id: "gone", title: "Gone", year: 2020, origin: "FridayLab", tool: "Blender" },
  { id: "bullet", title: "Bullet", year: 2020, origin: "FridayLab", tool: "Blender" },
  {
    id: "bouncing-cubes",
    title: "Bouncing cubes",
    year: 2019,
    origin: "Animation exercise",
    tool: "Blender",
  },
  { id: "chair", title: "Chair", year: 2023, origin: "Aninir", tool: "Blender" },
  { id: "donut", title: "Hello Donut", year: 2022, origin: "Aninir", tool: "Blender" },
  { id: "dreidel", title: "Dreidel", year: 2022, origin: "Aninir", tool: "Blender" },
  {
    id: "dreidel-2021",
    title: "Dreidel (2021)",
    year: 2021,
    origin: "3D printing",
    tool: "Blender",
  },
  { id: "tools", title: "Tools", year: 2023, origin: "Aninir", tool: "Blender" },
  {
    id: "nir-relief",
    title: "Nir",
    year: 2022,
    origin: "Aninir",
    tool: "Blender",
    note: "Engraved plaque for print, decimated for the web",
    turn: [90, 0, 0],
  },
  {
    id: "worldcup",
    title: "World Cup trophy",
    year: 2023,
    origin: "3D printing",
    tool: "Blender",
    note: "Decimated for the web",
  },
];
