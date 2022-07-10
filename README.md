# stcengine

playback engine for ZX Spectrum Soundtracker (.stc) files

## Installation

```
npm install stcengine
```

## Usage

This package exports a class `STCEngine` whose constructor accepts an STC data structure as returned by [stcformat](https://www.npmjs.com/package/stcformat). This object provides the following properties:

* `getAudioFrame()` - Returns the next frame of data, as a list of AY register writes each expressed as `[register, value]`
* `looped` - True if previous calls to `getAudioFrame` have reached the end of the module (at which point further calls will start again from the start of the module)
* `reset()` - Reset state to start playing from the start of the module.

```javascript
const fs = require("fs");
const { readSTC } = require("stcformat");
const { STCEngine } = require("stcengine");

const buf = fs.readFileSync('myfile.stc'));
const stcModule = readSTC(buf);
const engine = new STCEngine(stcModule);

while (!engine.looped) {
    console.log(engine.getAudioFrame());
}
```
