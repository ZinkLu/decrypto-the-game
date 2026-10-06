import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './load.mjs';

const { invitedRoom, roomInviteURL } = await import(await moduleUrl('invitation'));

test('public invitations round-trip four digits, including leading zeros', () => {
    for (const code of ['1234', '0007', '0000']) {
        const link = roomInviteURL(code, 'https://encrypto.example:8443/');
        assert.equal(link, `https://encrypto.example:8443/?room=${code}`);
        assert.equal(invitedRoom(new URL(link).search), code);
    }
});

test('sharing a room cannot leak preview options, hash or seat credentials', () => {
    const source = 'http://localhost:3000/preview/?preview=encrypting&quality=low&room=9999&resume_token=private#words';
    assert.equal(roomInviteURL('5821', source), 'http://localhost:3000/?room=5821');
});

test('invalid or ambiguous room parameters never trigger a join', () => {
    for (const search of ['', '?room=', '?room=123', '?room=12345', '?room=A1B2', '?room=%201234',
        '?room=1234%20', '?room=１２３４', '?room=1234&room=5678', '?room=1234&room=1234']) {
        assert.equal(invitedRoom(search), '', search);
    }
    assert.equal(invitedRoom('?quality=low&room=0007'), '0007');
});
