/** Invitations carry only the public four-digit room code, never a seat credential. */
export function invitedRoom(search: string): string {
    const codes = new URLSearchParams(search).getAll('room');
    return codes.length === 1 && /^[0-9]{4}$/.test(codes[0]) ? codes[0] : '';
}

/** Always open the live game, even when copied from a preview or a development bench. */
export function roomInviteURL(roomCode: string, pageURL: string): string {
    const url = new URL('/', pageURL);
    url.searchParams.set('room', roomCode);
    return url.href;
}
