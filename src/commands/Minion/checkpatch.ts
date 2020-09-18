import { CommandStore, KlasaMessage } from 'klasa';

import { stringMatches, formatDuration, toTitleCase } from '../../lib/util';
import { BotCommand } from '../../lib/BotCommand';
import { Time, Emoji } from '../../lib/constants';
import Farming from '../../lib/skilling/skills/farming/farming';
import { requiresMinion } from '../../lib/minions/decorators';
import resolvePatchTypeSetting from '../../lib/farming/functions/resolvePatchTypeSettings';
import { FarmingPatchTypes } from '../../lib/farming/types';

export default class extends BotCommand {
	public constructor(store: CommandStore, file: string[], directory: string) {
		super(store, file, directory, {
			altProtection: true,
			oneAtTime: true,
			cooldown: 1
		});
	}

	@requiresMinion
	async run(msg: KlasaMessage) {
		await msg.author.settings.sync(true);
		const currentDate = new Date().getTime();

		let baseStr = '';
		let emojiStr = '';
		let contentStr = '';
		let finalStr = '';

		const patchArray = Object.values(FarmingPatchTypes);
		for (let i = 0; i < patchArray.length; i++) {
			const patchType = patchArray[i];

			baseStr = `**${toTitleCase(patchType)} patch:** `;

			const getPatchType = resolvePatchTypeSetting(patchType);
			if (!getPatchType) return;
			const patch = msg.author.settings.get(getPatchType);

			if (patch.lastPlanted) {
				const plant = Farming.Plants.find(plants =>
					plants.aliases.some(
						alias =>
							stringMatches(alias, patch.lastPlanted) ||
							stringMatches(alias.split(' ')[0], patch.lastPlanted)
					)
				);

				if (!plant) throw `WTF Error`;

				const lastPlantTime: number = patch.plantTime;
				const difference = currentDate - lastPlantTime;
				if (difference < plant.growthTime * Time.Minute) {
					emojiStr = `${Emoji.Timer} `;
					contentStr = `Your ${patch.lastQuantity}x ${
						plant.name
					} will be ready to harvest in ${formatDuration(
						lastPlantTime + plant.growthTime * Time.Minute - currentDate
					)}!`;
				} else {
					emojiStr = `${Emoji.Tick} `;
					contentStr = `Your ${patch.lastQuantity}x ${plant.name} is ready to be harvested!`;
				}
			} else {
				emojiStr = `${Emoji.RedX} `;
				contentStr = `You have nothing planted in this patch!`;
			}
			contentStr += `\n`;
			finalStr += emojiStr + baseStr + contentStr;
		}
		return msg.send(finalStr);
	}
}
