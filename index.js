const TONE_PERIODS = [
    0x0ef8, 0x0e10, 0x0d60, 0x0c80, 0x0bd8, 0x0b28, 0x0a88, 0x09f0,
    0x0960, 0x08e0, 0x0858, 0x07e0, 0x077c, 0x0708, 0x06b0, 0x0640,
    0x05ec, 0x0594, 0x0544, 0x04f8, 0x04b0, 0x0470, 0x042c, 0x03f0,
    0x03be, 0x0384, 0x0358, 0x0320, 0x02f6, 0x02ca, 0x02a2, 0x027c,
    0x0258, 0x0238, 0x0216, 0x01f8, 0x01df, 0x01c2, 0x01ac, 0x0190,
    0x017b, 0x0165, 0x0151, 0x013e, 0x012c, 0x011c, 0x010b, 0x00fc,
    0x00ef, 0x00e1, 0x00d6, 0x00c8, 0x00bd, 0x00b2, 0x00a8, 0x009f,
    0x0096, 0x008e, 0x0085, 0x007e, 0x0077, 0x0070, 0x006b, 0x0064,
    0x005e, 0x0059, 0x0054, 0x004f, 0x004b, 0x0047, 0x0042, 0x003f,
    0x003b, 0x0038, 0x0035, 0x0032, 0x002f, 0x002c, 0x002a, 0x0027,
    0x0025, 0x0023, 0x0021, 0x001f, 0x001d, 0x001c, 0x001a, 0x0019,
    0x0017, 0x0016, 0x0015, 0x0013, 0x0012, 0x0011, 0x0010, 0x000f
].map((i) => {return i * 2;});

const NOTE_VALUES_BY_NAME = {};
const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
for (let octave=1; octave <= 8; octave++) {
    NOTE_NAMES.forEach((baseNoteName, i) => {
        const noteName = baseNoteName + octave;
        const noteVal = (octave - 1) * 12 + i;
        NOTE_VALUES_BY_NAME[noteName] = noteVal;
    });
}


class STCEngine {
    constructor(module, channels) {
        this.module = module;
        this.channelIndexes = channels || [0, 1, 2];
        this.reset();
    }

    reset() {
        this.looped = false;
        this.channelStates = [];
        for (let chan = 0; chan < 3; chan++) {
            this.channelStates[chan] = {
                'note': null,
                'sample': null,
                'ornament': null,
                'sampleFrame': 0,
                'envelope': 0,
                'envelopePeriod': 0,
            };
        }
        this.loadPosition(0);
        this.lastRegisterWrites = new Array(14);
    }

    loadPosition(positionNumber) {
        this.positionNumber = positionNumber;
        const position = this.module.positions[positionNumber];
        this.pattern = this.module.patterns[position[0]];
        this.transpose = position[1];
        this.loadRow(0);
    }

    loadRow(rowNumber) {
        this.rowNumber = rowNumber;
        this.rowFrameNumber = 0;
        const rowData = this.channelIndexes.map(channelIndex => {
            return this.pattern.channels[channelIndex][rowNumber];
        });
        rowData.forEach((channelRow, channelIndex) => {
            const channelState = this.channelStates[channelIndex];
            const [noteName, sampleNumber, effectNumber, effectParam] = channelRow;
            if (noteName == 'R--') {
                channelState.note = null;
            } else if (noteName == '---') {
                /* do nothing */
            } else {
                channelState.note = NOTE_VALUES_BY_NAME[noteName] + this.transpose;
                channelState.sampleFrame = 0;
                if (sampleNumber !== 0) {
                    channelState.sample = this.module.samples[sampleNumber];
                }
                if (effectNumber === 15) {
                    /* ornament on / envelope off */
                    channelState.envelope = 0;
                    if (effectParam === 0) {
                        channelState.ornament = null;
                    } else {
                        channelState.ornament = this.module.ornaments[effectParam];
                    }
                } else if (effectNumber !== 0) {
                    /* ornament off / envelope on */
                    channelState.ornament = null;
                    channelState.envelope = effectNumber;
                    channelState.envelopePeriod = effectParam;
                }
            }
        });
    }

    advanceRow() {
        const newRowNumber = this.rowNumber + 1;
        if (newRowNumber >= this.pattern.length) {
            this.advancePosition();
        } else {
            this.loadRow(newRowNumber);
        }
    }

    advancePosition() {
        const newPositionNumber = (this.positionNumber + 1);
        if (newPositionNumber >= this.module.length) {
            this.looped = true;
            this.loadPosition(0);
        } else {
            this.loadPosition(newPositionNumber);
        }
    }

    writeRegister(reg, val, writeList) {
        if (this.lastRegisterWrites[reg] !== val) {
            writeList.push([reg, val]);
            this.lastRegisterWrites[reg] = val;
        }
    }

    getAudioFrame() {
        const registerWrites = [];
        let mixer = 0xc0;
        let noiseLevel = 0;
        let envelope = 0;
        let envelopePeriod = 0;
        const volumes = [];

        this.channelStates.forEach((channelState, channelIndex) => {
            const reg0 = channelIndex * 2;
            const reg1 = reg0 + 1;
            if (
                channelState.note === null
                || channelState.sample === null
                || (channelState.sampleFrame >= 32 && channelState.sample.repeat === 0)
            ) {
                if (this.lastRegisterWrites[reg0] == null) {
                    this.writeRegister(reg0, 0, registerWrites);
                }
                if (this.lastRegisterWrites[reg1] == null) {
                    this.writeRegister(reg1, 0, registerWrites);
                }
                volumes[channelIndex] = 0;
            } else {
                const sample = channelState.sample;

                let sampleFrame = channelState.sampleFrame;
                if (sampleFrame >= 32) {
                    sampleFrame = (((sampleFrame - 32) % sample.repeatLength) + sample.repeat) % 32;
                }

                let note = channelState.note;
                if (channelState.ornament !== null) {
                    note += channelState.ornament.tones[sampleFrame];
                }
                let period = TONE_PERIODS[note - 1];

                period -= sample.tones[sampleFrame];
                period &= 0x0fff;
                this.writeRegister(channelIndex * 2, period & 0xff, registerWrites);
                this.writeRegister(channelIndex * 2 + 1, period >> 8, registerWrites);

                let vol;
                if (channelState.envelope === 0) {
                    vol = sample.volumes[sampleFrame];
                } else {
                    vol = 16;
                    envelope = channelState.envelope;
                    envelopePeriod = channelState.envelopePeriod;
                }
                if (sample.toneMasks[sampleFrame]) {
                    mixer |= (0x01 << channelIndex);
                }

                if (sample.noiseMasks[sampleFrame]) {
                    mixer |= (0x08 << channelIndex);
                } else {
                    noiseLevel = sample.noiseLevels[sampleFrame];
                }

                volumes[channelIndex] = vol;
                channelState.sampleFrame++;
            }
        })

        this.writeRegister(6, noiseLevel, registerWrites);
        this.writeRegister(7, mixer, registerWrites);
        for (let i = 0; i < 3; i++) {
            this.writeRegister(i + 8, volumes[i], registerWrites);
        }
        this.writeRegister(11, envelopePeriod, registerWrites);

        this.writeRegister(12, 0, registerWrites);

        // NB relies on writeRegister to skip duplicate writes
        this.writeRegister(13, envelope, registerWrites);

        this.rowFrameNumber++;
        if (this.rowFrameNumber >= this.module.tempo) {
            this.advanceRow();
        }

        return registerWrites;
    }
}

module.exports = { STCEngine };
