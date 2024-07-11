import { formatOrdinal, increaseBankQuantitesByPercent } from '@oldschoolgg/toolkit';
import { userMention } from 'discord.js';
import { randInt } from 'e';
import { Bank } from 'oldschooljs';
import { SkillsEnum } from 'oldschooljs/dist/constants';

import { Events } from '../../../lib/constants';
import { isDoubleLootActive } from '../../../lib/doubleLoot';

import { MOKTANG_ID, MoktangLootTable } from '../../../lib/minions/data/killableMonsters/custom/bosses/Moktang';
import {
	FletchingTipsTable,
	HighTierStoneSpiritTable,
	StoneSpiritTable,
	lowRuneHighAdamantTable,
	runeWeaponTable
} from '../../../lib/simulation/sharedTables';
import Smithing from '../../../lib/skilling/skills/smithing';
import type { MoktangTaskOptions } from '../../../lib/types/minions';
import { itemNameFromID } from '../../../lib/util';
import { handleTripFinish } from '../../../lib/util/handleTripFinish';
import { makeBankImage } from '../../../lib/util/makeBankImage';
import resolveItems from '../../../lib/util/resolveItems';

export const moktangTask: MinionTask = {
	type: 'Moktang',
	async run(data: MoktangTaskOptions) {
		const { userID, qty } = data;
		const user = await mUserFetch(userID);

		await user.incrementKC(MOKTANG_ID, qty);

		const loot = new Bank();

		for (let i = 0; i < qty; i++) {
			loot.add(MoktangLootTable.roll());
		}

		const bonusPercent = Math.floor(user.skillLevel(SkillsEnum.Mining) / 6);

		increaseBankQuantitesByPercent(loot, bonusPercent, [
			...StoneSpiritTable.allItems,
			...HighTierStoneSpiritTable.allItems,
			...Smithing.Bars.map(i => i.id),
			...runeWeaponTable.allItems,
			...FletchingTipsTable.allItems,
			...lowRuneHighAdamantTable.allItems
		]);

		if (isDoubleLootActive(data.duration)) {
			loot.multiply(2);
			data.cantBeDoubled = true;
		}

		const res = await user.addItemsToBank({ items: loot, collectionLog: true });

		const xpStr = await user.addXP({
			skillName: SkillsEnum.Mining,
			amount: user.skillLevel(SkillsEnum.Mining) * 2000 * qty,
			duration: data.duration,
			multiplier: false,
			masterCapeBoost: true
		});

		const image = await makeBankImage({
			bank: res.itemsAdded,
			title: `Loot From ${qty} Moktang`,
			user,
			previousCL: res.previousCL
		});

		const newKC = await user.getKC(MOKTANG_ID);
		for (const item of resolveItems(['Igne gear frame', 'Mini moktang'])) {
			if (loot.has(item)) {
				globalClient.emit(
					Events.ServerNotification,
					`**${user.usernameOrMention}'s** minion just received their ${formatOrdinal(
						user.cl.amount(item)
					)} ${itemNameFromID(item)} on their ${formatOrdinal(randInt(newKC - qty, newKC))} kill!`
				);
			}
		}

		const str = `${userMention(data.userID)}, ${
			user.minionName
		} finished killing ${qty}x Moktang. ${bonusPercent}% bonus loot because of your Mining level. Received ${loot}.

${xpStr}`;

		handleTripFinish(user, data.channelID, str, image.file.attachment, data, loot);
	}
};
