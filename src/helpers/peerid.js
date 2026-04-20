export function constructPeerID(gameID, playerID) {
  return `${gameID}-${playerID}`;
}

export function sendConstructor(myid, data, options = {}) {
  return { myid, data, options };
}

export async function getPeerConfig() {
  return undefined;
}
