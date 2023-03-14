function getFrequency(note: String) {
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
  const n = noteNames[noteName] + (octave - 4) * 12;
  return baseFrequency * Math.pow(2, n / 12);
}

type Synth = {
  audioContext: AudioContext;
  oscillators: OscillatorNode[];
  waveform: OscillatorType;
  detune: number;
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
    delay: number;
    feedback: number;
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

  synth = {
    audioContext,
    volume: {
      gainNode: volumeNode,
    },
    oscillators: [],
    waveform: "sawtooth",
    detune: 10,
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
      delay: 0.1,
      feedback: 0.5,
    },
  };
}

function createOscillator(frequency: number, detune: number) {
  const oscillator = synth.audioContext.createOscillator();
  oscillator.type = synth.waveform;
  oscillator.frequency.value = frequency;
  oscillator.detune.value = detune;

  oscillator.connect(synth.adsr.gainNode);

  oscillator.start();

  return oscillator;
}

function playNote(note: string) {
  if (!synth) {
    initializeSynth();
  }

  synth.oscillators.forEach((osc) => osc.stop());
  synth.adsr.gainNode.gain.cancelScheduledValues(
    synth.audioContext.currentTime
  );
  synth.echo.feedbackGainNode.gain.cancelScheduledValues(
    synth.audioContext.currentTime
  );

  const frequency = getFrequency(note);

  synth.oscillators[0] = createOscillator(frequency, 0);
  synth.oscillators[1] = createOscillator(frequency, synth.detune);
  synth.oscillators[2] = createOscillator(frequency, -synth.detune);

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

  synth.echo.delayNode.delayTime.value = synth.echo.delay;
  synth.echo.feedbackGainNode.gain.setValueAtTime(
    synth.echo.feedback,
    synth.audioContext.currentTime
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

  synth.oscillators.forEach((osc) => osc.stop(releaseEnd));
}

function setVolume(volume: string) {
  if (!synth) initializeSynth();
  synth.volume.gainNode.gain.value = Number(volume);
}

function setDetune(detune: string) {
  if (!synth) initializeSynth();
  synth.detune = Number(detune);
}

function setLowpassFrequency(frequency: string) {
  if (!synth) initializeSynth();
  synth.lowpass.filterNode.frequency.value =
    (Number(frequency) * synth.audioContext.sampleRate) / 2;
}

function setLowpassQ(q: string) {
  if (!synth) initializeSynth();
  synth.lowpass.filterNode.Q.value = Number(q) * 30;
}

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

function setEchoDelay(time: string) {
  if (!synth) initializeSynth();
  synth.echo.delay = Number(time);
}

function setEchoFeedback(feedback: string) {
  if (!synth) initializeSynth();
  synth.echo.feedback = Number(feedback);
}

function setWaveform(waveform: string) {
  if (!synth) initializeSynth();

  const waveforms: OscillatorType[] = [
    "sine",
    "square",
    "sawtooth",
    "triangle",
  ];

  synth.waveform = waveforms[Number(waveform)];
}
