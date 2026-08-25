import { createFileRoute, redirect } from "@tanstack/react-router";
 
// Artist 360 is folded into The Book (table/cards toggle). The standalone card
// grid is retired; the per-artist notes drill (/artists/$artistId) stays as the
// target of the "Notes" links. Anyone hitting /artists lands on The Book.
export const Route = createFileRoute("/_authenticated/artists/")({
  beforeLoad: () => {
    throw redirect({ to: "/book" });
  },
});
 
