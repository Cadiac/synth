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
  }[];
  volume: {
    gainNode: GainNode;
  };
  lowpass: {
    filterNode: BiquadFilterNode;
  };
  noise: {
    enabled: boolean;
    generator: AudioBufferSourceNode;
    gain: GainNode;
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
  // OSC - -> ADSR - - - > Lowpass -> Volume -> Destination
  // Noise -^  v                ^
  //           Delay <-> Feedback
  adsrGainNode.connect(lowpassFilterNode);
  adsrGainNode.connect(delayNode);
  delayNode.connect(delayFeedbackGainNode);
  delayFeedbackGainNode.connect(delayNode);
  delayFeedbackGainNode.connect(lowpassFilterNode);
  lowpassFilterNode.connect(volumeNode);
  volumeNode.connect(audioContext.destination);

  // Master volume
  const volume = 0.8;
  volumeNode.gain.value = volume;

  // Lowpass filter
  lowpassFilterNode.type = "lowpass";
  lowpassFilterNode.frequency.value = (0.5 * audioContext.sampleRate) / 2;
  lowpassFilterNode.Q.value = 15;

  // ADSR
  adsrGainNode.gain.value = 0.0;

  // Delay
  delayNode.delayTime.value = 0.5;
  delayFeedbackGainNode.gain.value = 0.0;

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
    noise: createWhiteNoise(audioContext, adsrGainNode),
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
  gainNode.gain.value = 0.5;

  // OSC -> Gain -> Destination
  oscillator.connect(gainNode);
  gainNode.connect(destination);

  oscillator.start();

  return {
    osc: oscillator,
    gain: gainNode,
    octave,
  };
}

function createWhiteNoise(audioContext: AudioContext, destination: AudioNode) {
  const bufferSize = audioContext.sampleRate * 2; // 2 seconds of audio
  const buffer = audioContext.createBuffer(
    1,
    bufferSize,
    audioContext.sampleRate
  );

  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    channelData[i] = Math.random() * 2 - 1;
  }

  const noiseGeneratorNode = audioContext.createBufferSource();
  noiseGeneratorNode.buffer = buffer;
  noiseGeneratorNode.loop = true;

  const gainNode = new GainNode(audioContext);
  gainNode.gain.value = 0.5;

  // Noise generator -> Gain -> Destination
  // NOTE: noiseGeneratorNode is disconnected by default
  gainNode.connect(destination);

  // start playing the noise
  noiseGeneratorNode.start();

  return {
    enabled: false,
    generator: noiseGeneratorNode,
    gain: gainNode,
  };
}

function createPinkNoise(audioContext: AudioContext, destination: AudioNode) {
  const bufferSize = audioContext.sampleRate * 2; // 2 seconds of audio
  const noiseBuffer = audioContext.createBuffer(
    1,
    bufferSize,
    audioContext.sampleRate
  );

  // Based on https://noisehack.com/generate-noise-web-audio-api/
  // which in turn is based on "Paul Kellet’s refined method", now 404
  const b = [0, 0, 0, 0, 0, 0, 0];
  const channelData = noiseBuffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;

    b[0] = 0.99886 * b[0] + white * 0.0555179;
    b[1] = 0.99332 * b[1] + white * 0.0750759;
    b[2] = 0.969 * b[2] + white * 0.153852;
    b[3] = 0.8665 * b[3] + white * 0.3104856;
    b[4] = 0.55 * b[4] + white * 0.5329522;
    b[5] = -0.7616 * b[5] - white * 0.016898;

    channelData[i] =
      b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + white * 0.5362;
    channelData[i] *= 0.11; // (roughly) compensate for gain
    b[6] = white * 0.115926;
  }

  // Connect the noise buffer to the filter
  const noiseGeneratorNode = audioContext.createBufferSource();
  noiseGeneratorNode.buffer = noiseBuffer;
  noiseGeneratorNode.loop = true;

  // Gain node to control volume
  const gainNode = new GainNode(audioContext);
  gainNode.gain.value = 0.5;

  // Noise generator -> Gain -> Destination
  // NOTE: noiseGeneratorNode is disconnected by default
  gainNode.connect(destination);

  noiseGeneratorNode.start();

  return {
    enabled: false,
    generator: noiseGeneratorNode,
    gain: gainNode,
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

function toggleOscillator(enabled: boolean, oscillator: number) {
  if (!synth) initializeSynth();
  if (enabled) {
    synth.oscillators[oscillator].osc.connect(
      synth.oscillators[oscillator].gain
    );
  } else {
    synth.oscillators[oscillator].osc.disconnect();
  }
}

// Noise generator

function setNoiseVolume(volume: string) {
  if (!synth) initializeSynth();
  synth.noise.gain.gain.value = Number(volume);
}

function toggleNoise(enabled: boolean) {
  if (!synth) initializeSynth();
  if (enabled) {
    synth.noise.generator.connect(synth.noise.gain);
  } else {
    synth.noise.generator.disconnect();
  }

  synth.noise.enabled = enabled;
}

function toggleNoiseColor(isWhite: boolean) {
  if (!synth) initializeSynth();
  synth.noise.generator.disconnect();

  const isEnabled = synth.noise.enabled;
  const volume = synth.noise.gain.gain.value;

  if (isWhite) {
    synth.noise = createWhiteNoise(synth.audioContext, synth.adsr.gainNode);
  } else {
    synth.noise = createPinkNoise(synth.audioContext, synth.adsr.gainNode);
  }

  synth.noise.enabled = isEnabled;
  synth.noise.gain.gain.value = volume;

  if (synth.noise.enabled) {
    synth.noise.generator.connect(synth.noise.gain);
  }
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
