const fs = require("fs");
const path = require("path");
const { readSTC } = require("stcformat");
const { STCEngine } = require("..");

test("can play STC files", () => {
    const buf = fs.readFileSync(path.join(__dirname, 'neverland.stc'));
    const stcModule = readSTC(buf);
    const engine = new STCEngine(stcModule);

    const registerWrites0 = engine.getAudioFrame();
    expect(registerWrites0).toStrictEqual([
        [ 0, 0 ],   [ 1, 0 ],
        [ 2, 62 ],  [ 3, 1 ],
        [ 4, 190 ], [ 5, 3 ],
        [ 6, 0 ],   [ 7, 240 ],
        [ 8, 0 ],   [ 9, 15 ],
        [ 10, 16 ], [ 11, 60 ],
        [ 12, 0 ],  [ 13, 12 ]
    ]);
    const registerWrites1 = engine.getAudioFrame();
    expect(registerWrites1).toStrictEqual([]);
    const registerWrites2 = engine.getAudioFrame();
    expect(registerWrites2).toStrictEqual([[ 2, 239 ], [ 3, 0 ], [ 9, 14 ]]);
    const registerWrites3 = engine.getAudioFrame();
    expect(registerWrites3).toStrictEqual([]);

    for (let i = 0; i < 8443; i++) {
        engine.getAudioFrame();
    }
    expect(engine.looped).toBe(false);
    engine.getAudioFrame();
    expect(engine.looped).toBe(true);
});
