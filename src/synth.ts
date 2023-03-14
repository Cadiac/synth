function getFrequency(note: String, baseOctave: number) {
  const baseFrequency = 440; // A4
  const noteNames: { [key: string]: number } = {
    C: -9,
    "C#": -8,
    D: -7,
    "D#": -6,
    E: -5,
    F: -4,
    "F#": -3,
    G: -2,
    "G#": -1,
    A: 0,
    "A#": 1,
    B: 2,
  };

  const octave = parseInt(note[note.length - 1]);
  const noteName = note.slice(0, -1);
  const n = noteNames[noteName] + (baseOctave - 4 + octave - 4) * 12;
  return baseFrequency * Math.pow(2, n / 12);
}

type Synth = {
  audioContext: AudioContext;
  oscillators: {
    osc: OscillatorNode;
    gain: GainNode;
    octave: number;
    volume: number;
  }[];
  volume: {
    gainNode: GainNode;
  };
  lowpass: {
    filterNode: BiquadFilterNode;
  };
  adsr: {
    gainNode: GainNode;
    attack: number;
    decay: number;
    sustain: number;
    release: number;
    maxDuration: number;
  };
  echo: {
    delayNode: DelayNode;
    feedbackGainNode: GainNode;
  };
};

let synth: Synth;

function initializeSynth() {
  const audioContext = new AudioContext();

  const volumeNode = audioContext.createGain();
  const adsrGainNode = audioContext.createGain();
  const lowpassFilterNode = audioContext.createBiquadFilter();
  const delayNode = audioContext.createDelay();
  const delayFeedbackGainNode = audioContext.createGain();

  // Connections:
  // OSC -> ADSR -> Lowpass -> Volume -> Destination
  //         l-> Delay -^
  //              ^-> Feedback -> Delay

  adsrGainNode.connect(lowpassFilterNode);
  adsrGainNode.connect(delayNode);
  delayNode.connect(lowpassFilterNode);
  delayNode.connect(delayFeedbackGainNode);
  delayFeedbackGainNode.connect(delayNode);
  lowpassFilterNode.connect(volumeNode);
  volumeNode.connect(audioContext.destination);

  // Master volume
  const volume = 0.8;
  volumeNode.gain.value = volume;

  // Lowpass filter
  lowpassFilterNode.type = "lowpass";
  lowpassFilterNode.frequency.value = (0.5 * audioContext.sampleRate) / 2;
  lowpassFilterNode.Q.value = 15;

  // Delay
  delayNode.delayTime.value = 0.1;
  delayFeedbackGainNode.gain.value = 0.5;

  synth = {
    audioContext,
    volume: {
      gainNode: volumeNode,
    },
    oscillators: [
      createOscillator(audioContext, 4, adsrGainNode),
      createOscillator(audioContext, 4, adsrGainNode),
      createOscillator(audioContext, 4, adsrGainNode),
    ],
    lowpass: {
      filterNode: lowpassFilterNode,
    },
    adsr: {
      gainNode: adsrGainNode,
      attack: 0.1,
      decay: 0.2,
      sustain: 0.3,
      release: 0.4,
      maxDuration: 2,
    },
    echo: {
      delayNode,
      feedbackGainNode: delayFeedbackGainNode,
    },
  };
}

function createOscillator(
  audioContext: AudioContext,
  octave: number,
  destination: AudioNode
) {
  const oscillator = new OscillatorNode(audioContext);
  oscillator.type = "sawtooth";
  oscillator.frequency.value = 440 * Math.pow(2, octave - 4); // A
  oscillator.detune.value = 0;

  const gainNode = new GainNode(audioContext);
  const volume = 0.5;
  gainNode.gain.value = volume;

  // OSC -> Gain -> Destination
  oscillator.connect(gainNode);
  gainNode.connect(destination);

  oscillator.start();

  return {
    osc: oscillator,
    gain: gainNode,
    octave,
    volume,
  };
}

function startNote(note: string) {
  if (!synth) {
    initializeSynth();
  }

  synth.adsr.gainNode.gain.cancelScheduledValues(
    synth.audioContext.currentTime
  );
  synth.echo.feedbackGainNode.gain.cancelScheduledValues(
    synth.audioContext.currentTime
  );

  synth.oscillators.forEach((oscillator) => {
    oscillator.osc.frequency.setValueAtTime(
      getFrequency(note, oscillator.octave),
      synth.audioContext.currentTime
    );
  });

  const attackEnd =
    synth.audioContext.currentTime + synth.adsr.attack * synth.adsr.maxDuration;
  const decayDuration = synth.adsr.decay * synth.adsr.maxDuration;

  synth.adsr.gainNode.gain.setValueAtTime(0, synth.audioContext.currentTime);
  synth.adsr.gainNode.gain.linearRampToValueAtTime(1, attackEnd);
  synth.adsr.gainNode.gain.setTargetAtTime(
    synth.adsr.sustain,
    attackEnd,
    decayDuration
  );
}

function stopNote() {
  synth.adsr.gainNode.gain.cancelScheduledValues(
    synth.audioContext.currentTime
  );
  synth.echo.feedbackGainNode.gain.cancelScheduledValues(
    synth.audioContext.currentTime
  );

  const releaseDuration = synth.adsr.release * synth.adsr.maxDuration;
  const releaseEnd = synth.audioContext.currentTime + releaseDuration;

  synth.adsr.gainNode.gain.setValueAtTime(
    synth.adsr.gainNode.gain.value,
    synth.audioContext.currentTime
  );
  synth.adsr.gainNode.gain.linearRampToValueAtTime(0, releaseEnd);
}

// Controls

function setMasterVolume(volume: string) {
  if (!synth) initializeSynth();
  synth.volume.gainNode.gain.value = Number(volume);
}

// Oscillators

function setOscillatorVolume(volume: string, oscillator: number) {
  if (!synth) initializeSynth();
  synth.oscillators[oscillator].gain.gain.value = Number(volume);
}

function setOscillatorDetune(detune: string, oscillator: number) {
  if (!synth) initializeSynth();
  synth.oscillators[oscillator].osc.detune.value = Number(detune);
}

function setOscillatorWaveform(waveform: string, oscillator: number) {
  if (!synth) initializeSynth();

  const waveforms: OscillatorType[] = [
    "sine",
    "square",
    "sawtooth",
    "triangle",
  ];

  synth.oscillators[oscillator].osc.type = waveforms[Number(waveform)];
}

function setOscillatorOctave(octave: string, oscillator: number) {
  if (!synth) initializeSynth();
  synth.oscillators[oscillator].octave = Number(octave);
}

// Lowpass filter

function setLowpassFrequency(frequency: string) {
  if (!synth) initializeSynth();
  synth.lowpass.filterNode.frequency.value =
    (Number(frequency) * synth.audioContext.sampleRate) / 2;
}

function setLowpassQ(q: string) {
  if (!synth) initializeSynth();
  synth.lowpass.filterNode.Q.value = Number(q) * 30;
}

// ADSR

function setAdsrAttack(attack: string) {
  if (!synth) initializeSynth();
  synth.adsr.attack = Number(attack);
}

function setAdsrDecay(decay: string) {
  if (!synth) initializeSynth();
  synth.adsr.decay = Number(decay);
}

function setAdsrSustain(sustain: string) {
  if (!synth) initializeSynth();
  synth.adsr.sustain = Number(sustain);
}

function setAdsrRelease(release: string) {
  if (!synth) initializeSynth();
  synth.adsr.release = Number(release);
}

// Echo

function setEchoDelay(time: string) {
  if (!synth) initializeSynth();
  synth.echo.delayNode.delayTime.value = Number(time);
}

function setEchoFeedback(feedback: string) {
  if (!synth) initializeSynth();
  synth.echo.feedbackGainNode.gain.setValueAtTime(
    Number(feedback),
    synth.audioContext.currentTime
  );
}
