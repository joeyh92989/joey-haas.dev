import vocabulary from './tagVocabulary.json'

/**
 * Tags: the words people read, for the keys the API stores (backend/tags.py;
 * tagVocabulary.json is the shared list of keys, and a test holds the two
 * together). A tag is a curated word from its type's vocabulary, drawn in
 * labelled groups and never mixed with platforms.
 */
export const tagWords = {
  game: {
    play_style: {
      label: 'Play style',
      tags: {
        shooter: 'Shooter',
        rpg: 'RPG',
        platformer: 'Platformer',
        'open-world': 'Open world',
        puzzle: 'Puzzle',
        strategy: 'Strategy',
        racing: 'Racing',
        simulation: 'Simulation',
        survival: 'Survival',
        party: 'Party',
        'beat-em-up': 'Beat ’em up',
        stealth: 'Stealth',
        fighting: 'Fighting',
        'card-and-board': 'Card & board',
        sports: 'Sports',
        'story-led': 'Story-led',
        metroidvania: 'Metroidvania',
        roguelike: 'Roguelike',
        soulslike: 'Soulslike',
      },
    },
    setting: {
      label: 'Setting',
      tags: {
        'sci-fi': 'Sci-fi',
        fantasy: 'Fantasy',
        horror: 'Horror',
        mystery: 'Mystery',
        war: 'War',
        historical: 'Historical',
      },
    },
    tone: {
      label: 'Tone',
      tags: { comedy: 'Comedy', drama: 'Drama', family: 'Family' },
    },
  },
  comic: {
    genre: {
      label: 'Genre',
      tags: {
        horror: 'Horror',
        'sci-fi': 'Sci-fi',
        fantasy: 'Fantasy',
        crime: 'Crime',
        action: 'Action',
        comedy: 'Comedy',
        superhero: 'Superhero',
        war: 'War',
        western: 'Western',
        romance: 'Romance',
        'post-apocalyptic': 'Post-apocalyptic',
      },
    },
    based_on: {
      label: 'Based on',
      tags: { movie: 'Movie', tv: 'TV', game: 'Game', original: 'Original' },
    },
    form: {
      label: 'Form',
      tags: {
        anthology: 'Anthology',
        'mini-series': 'Mini-series',
        ongoing: 'Ongoing',
        'one-shot': 'One-shot',
        'pin-up': 'Pin-up',
      },
    },
  },
}

/** The label of the platforms row on an item page, beside the tag groups. */
export const platformsLabel = 'Platforms'

/** Copy for the edit pages' picker. */
export const tagPicker = {
  title: 'Tags',
  hint: 'Saving these keeps them: they are not worked out again.',
}

/** The types that have a vocabulary. */
export const TAGGED_TYPES = Object.keys(vocabulary)

/**
 * A type's groups, in the order the API stores them.
 *
 * @param {string} type
 * @returns {{key: string, label: string, tags: {key: string, label: string}[]}[]}
 */
export function tagGroupsOf(type) {
  return (vocabulary[type] ?? []).map(({ key, tags }) => ({
    key,
    label: tagWords[type][key].label,
    tags: tags.map((tag) => ({
      key: tag,
      label: tagWords[type][key].tags[tag],
    })),
  }))
}
