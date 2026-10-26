/**
 * Built-in 3D character model paths.
 * Loads the original files under /models/characters/*.glb.
 */
import { getAssetPath } from '../../../utils/pathUtils';

export interface BuiltInCharacterModel {
  key: string;
  path: string;
}

export const BUILT_IN_CHARACTERS: BuiltInCharacterModel[] = [
  {
    key: 'pose3d.character.adultMale',
    path: getAssetPath('/models/characters/adult-male.glb'),
  },
  {
    key: 'pose3d.character.adultFemale',
    path: getAssetPath('/models/characters/adult-female.glb'),
  },
  {
    key: 'pose3d.character.teenMale',
    path: getAssetPath('/models/characters/teen-male.glb'),
  },
  {
    key: 'pose3d.character.teenFemale',
    path: getAssetPath('/models/characters/teen-female.glb'),
  },
  {
    key: 'pose3d.character.child',
    path: getAssetPath('/models/characters/child.glb'),
  },
  {
    key: 'pose3d.character.baby',
    path: getAssetPath('/models/characters/baby.glb'),
  },
];

export function findBuiltInCharacterByPath(
  modelPath: string
): BuiltInCharacterModel | undefined {
  return BUILT_IN_CHARACTERS.find((m) => m.path === modelPath);
}
