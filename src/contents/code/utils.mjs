import { Workspace, config, QML } from "./core.mjs";

export function log(message, level = "info") {
  if (!config.enableDebugLogging) return;
  console.log(`[${level}] KZones: ${message}`);
}

export function osd(text, icon = "preferences-desktop-virtual") {
  if (!config.showOsdMessages) return;
  QML.dbusCall.exec("org.kde.plasmashell", "/org/kde/osdService", "showText", [icon, text]);
}

export function isPointInside(x, y, geometry) {
  return x >= geometry.x && x <= geometry.x + geometry.width && y >= geometry.y && y <= geometry.y + geometry.height;
}

export function isHovering(item) {
  const itemGlobal = item.mapToGlobal(Qt.point(0, 0));
  return isPointInside(Workspace.cursorPos.x, Workspace.cursorPos.y, {
    x: itemGlobal.x,
    y: itemGlobal.y,
    width: item.width * item.scale,
    height: item.height * item.scale,
  });
}

export function overlapArea(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 <= x1 || y2 <= y1) return 0;
  return (x2 - x1) * (y2 - y1);
}

// A key that identifies a window the same way on every invocation, so a cycle
// order built from it cannot be reshuffled while windows are raised and lowered.
// internalId is a stable per-window UUID and is what KWin 6 always provides; seq
// is a last-resort fallback for builds that don't expose it, and is only as stable
// as the caller's enumeration order.
export function windowKey(client, seq) {
  const id = client.internalId;
  if (id !== undefined && id !== null) {
    const key = String(id);
    if (key.length > 0 && key !== "undefined") return "id:" + key;
  }
  // Zero-padded so it compares in numeric order as a string.
  return "seq:" + ("0000" + seq).slice(-5);
}

// Picks which window to activate among the candidates overlapping a zone.
// candidates is a list of { client, area, key }, stackingOrder runs bottom to top.
export function pickWindowInZone(candidates, stackingOrder, activeWindow) {
  if (candidates.length === 0) return null;

  // Every window covering nearly as much of the zone as the best match counts as
  // being in it, so a stack of windows sharing a zone stays reachable instead of
  // just the single best-overlapping one.
  let bestArea = 0;
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i].area > bestArea) bestArea = candidates[i].area;
  }
  const inZone = candidates.filter((candidate) => candidate.area >= bestArea * 0.9);

  // The cycle order must not come from the stacking order: activating a window
  // raises it, which would leave the window we just left permanently next in line,
  // ping-ponging between two windows instead of reaching the rest.
  inZone.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  // Pressing the same zone again cycles through the windows stacked in it.
  for (let i = 0; i < inZone.length; i++) {
    if (inZone[i].client === activeWindow) return inZone[(i + 1) % inZone.length].client;
  }

  // Entering the zone from outside lands on the window last used there, which is
  // whichever of them sits highest in the stacking order.
  let topmost = inZone[0];
  for (let i = 0; i < inZone.length; i++) {
    if (stackingOrder.indexOf(inZone[i].client) > stackingOrder.indexOf(topmost.client)) topmost = inZone[i];
  }
  return topmost.client;
}
