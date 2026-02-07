// AI Persona definitions for opponent selection
// Each persona has unique parameters affecting play style

export const AI_PERSONAS = [
    {
        id: 'rookie_rick',
        name: 'Rookie Rick',
        color: '#4CAF50',
        initial: 'R',
        lineAccuracy: 1.2,
        powerAccuracy: 0.22,
        safetyBias: -30,
        powerBias: 1.15,
        spinAbility: 0.3,
        shotSelection: 'random',
        positionPlay: 0.02,
        thinkingDelay: 400
    },
    {
        id: 'steady_sue',
        name: 'Steady Sue',
        color: '#E91E63',
        initial: 'S',
        lineAccuracy: 0.7,
        powerAccuracy: 0.15,
        safetyBias: 15,
        powerBias: 0.95,
        spinAbility: 0.5,
        shotSelection: 'top3',
        positionPlay: 0.15,
        thinkingDelay: 350
    },
    {
        id: 'hustler_hank',
        name: 'Hustler Hank',
        color: '#FF9800',
        initial: 'H',
        lineAccuracy: 0.5,
        powerAccuracy: 0.12,
        safetyBias: -15,
        powerBias: 1.25,
        spinAbility: 0.6,
        shotSelection: 'top3',
        positionPlay: 0.08,
        thinkingDelay: 300
    },
    {
        id: 'professor_pat',
        name: 'Professor Pat',
        color: '#9C27B0',
        initial: 'P',
        lineAccuracy: 0.4,
        powerAccuracy: 0.10,
        safetyBias: 20,
        powerBias: 1.0,
        spinAbility: 0.7,
        shotSelection: 'optimal',
        positionPlay: 0.20,
        thinkingDelay: 350
    },
    {
        id: 'clara_cue_queen',
        name: 'Clara "Cue Queen"',
        color: '#F44336',
        initial: 'C',
        lineAccuracy: 0.25,
        powerAccuracy: 0.08,
        safetyBias: 10,
        powerBias: 1.0,
        spinAbility: 0.8,
        shotSelection: 'optimal',
        positionPlay: 0.18,
        thinkingDelay: 300
    },
    {
        id: 'deadshot_dave',
        name: 'Deadshot Dave',
        color: '#2196F3',
        initial: 'D',
        lineAccuracy: 0.1,
        powerAccuracy: 0.05,
        safetyBias: -20,
        powerBias: 1.1,
        spinAbility: 0.9,
        shotSelection: 'optimal',
        positionPlay: 0.12,
        thinkingDelay: 250
    },
    {
        id: 'iron_nina',
        name: 'Iron Nina',
        color: '#FFD700',
        initial: 'N',
        lineAccuracy: 0.02,
        powerAccuracy: 0.03,
        safetyBias: 5,
        powerBias: 1.0,
        spinAbility: 0.9,
        shotSelection: 'optimal',
        positionPlay: 0.25,
        thinkingDelay: 300
    },
    {
        id: 'the_machine',
        name: 'The Machine',
        color: '#607D8B',
        initial: 'M',
        lineAccuracy: 0.0,
        powerAccuracy: 0.01,
        safetyBias: 0,
        powerBias: 1.0,
        spinAbility: 0.9,
        shotSelection: 'optimal',
        positionPlay: 0.30,
        thinkingDelay: 200
    }
];

export function getPersonaById(id) {
    return AI_PERSONAS.find(p => p.id === id) || AI_PERSONAS[0];
}
