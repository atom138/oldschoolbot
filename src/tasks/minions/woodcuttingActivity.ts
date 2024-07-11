import { Time, objectEntries, percentChance, randInt, roll } from 'e';
import { Bank } from 'oldschooljs';

import { itemID } from 'oldschooljs/dist/util';
import { MAX_LEVEL, MIN_LENGTH_FOR_PET, type TwitcherGloves } from '../../lib/constants';
import { MediumSeedPackTable } from '../../lib/data/seedPackTables';
import addSkillingClueToLoot from '../../lib/minions/functions/addSkillingClueToLoot';
import { eggNest } from '../../lib/simulation/birdsNest';
import { soteSkillRequirements } from '../../lib/skilling/functions/questRequirements';
import Firemaking from '../../lib/skilling/skills/firemaking';
import { ForestryEvents, LeafTable } from '../../lib/skilling/skills/woodcutting/forestry';
import Woodcutting from '../../lib/skilling/skills/woodcutting/woodcutting';
import { SkillsEnum } from '../../lib/skilling/types';
import type { WoodcuttingActivityTaskOptions } from '../../lib/types/minions';
import { clAdjustedDroprate, perTimeUnitChance, skillingPetDropRate } from '../../lib/util';
import { handleTripFinish } from '../../lib/util/handleTripFinish';
import resolveItems from '../../lib/util/resolveItems';
import { userStatsBankUpdate } from '../../mahoji/mahojiSettings';

async function handleForestry({ user, duration, loot }: { user: MUser; duration: number; loot: Bank }) {
	const eventCounts: { [key: number]: number } = {};
	const eventXP = {} as { [key in SkillsEnum]: number };
	ForestryEvents.forEach(event => {
		eventCounts[event.id] = 0;
		eventXP[event.uniqueXP] = 0;
	});

	let strForestry = '';
	const userWcLevel = user.skillLevel(SkillsEnum.Woodcutting);
	const chanceWcLevel = Math.min(userWcLevel, 99);

	const pekyBoost = user.usingPet('Peky') ? 5 : 1;
	const eggChance = Math.ceil((2700 - ((chanceWcLevel - 1) * (2700 - 1350)) / 98) / pekyBoost);
	const whistleChance = Math.ceil((90 - ((chanceWcLevel - 1) * (90 - 45)) / 98) / pekyBoost);
	const garlandChance = Math.ceil(50 / pekyBoost);

	perTimeUnitChance(duration, 20, Time.Minute, async () => {
		const eventIndex = randInt(0, ForestryEvents.length - 1);
		const event = ForestryEvents[eventIndex];
		let eventRounds = 0;
		let eventInteraction = 0;

		switch (event.id) {
			case 1: // Rising Roots
				eventRounds = randInt(5, 7); // anima-infused roots spawned
				for (let i = 0; i < eventRounds; i++) {
					eventInteraction += randInt(5, 6); // anima-infused roots chopped
				}
				eventCounts[event.id]++;
				eventXP[event.uniqueXP] += user.skillLevel(event.uniqueXP) * 1.4 * eventInteraction;
				break;
			case 2: // Struggling Sapling
				eventInteraction = randInt(12, 15); // mulch added to sapling
				loot.add(LeafTable.roll());
				eventCounts[event.id]++;
				eventXP[event.uniqueXP] += eventInteraction * (user.skillLevel(event.uniqueXP) * 0.6);
				eventXP[SkillsEnum.Woodcutting] += eventInteraction * (userWcLevel * 1.95) * 2;
				break;
			case 3: // Flowering Bush
				eventRounds = randInt(5, 7); // bush pairs spawned
				for (let i = 0; i < eventRounds; i++) {
					eventInteraction += randInt(12, 20); // bushes pollinated
				}
				loot.add('Strange fruit', randInt(4, 8)).add(MediumSeedPackTable.roll());
				eventCounts[event.id]++;
				eventXP[event.uniqueXP] += user.skillLevel(event.uniqueXP) * 0.25 * eventInteraction * 3;
				break;
			case 4: // Woodcutting Leprechaun
				eventInteraction = randInt(6, 8); // rainbows entered
				eventCounts[event.id]++;
				eventXP[event.uniqueXP] += user.skillLevel(event.uniqueXP) * 2 * eventInteraction;
				break;
			case 5: // Beehive
				eventRounds = randInt(5, 7); // beehives spawned
				for (let i = 0; i < eventRounds; i++) {
					if (percentChance(66)) {
						loot.add('Sturdy beehive parts');
					}
					eventInteraction += randInt(5, 10); // repairs per beehive
				}
				eventCounts[event.id]++;
				eventXP[event.uniqueXP] += user.skillLevel(event.uniqueXP) * 0.3 * eventInteraction;
				eventXP[SkillsEnum.Woodcutting] +=
					eventInteraction * (userWcLevel * 0.6) + userWcLevel * 3.8 * eventRounds;
				break;
			case 6: // Friendly Ent
				eventInteraction = randInt(40, 60); // ents pruned
				loot.add(LeafTable.roll());
				loot.add(eggNest.roll());
				eventCounts[event.id]++;
				eventXP[event.uniqueXP] += user.skillLevel(event.uniqueXP) * 0.2 * eventInteraction;
				eventXP[SkillsEnum.Woodcutting] += eventInteraction * (userWcLevel * 0.55);
				break;
			case 7: // Poachers
				eventInteraction = randInt(12, 15); // traps disarmed
				if (roll(whistleChance)) {
					loot.add('Fox whistle');
				}
				eventCounts[event.id]++;
				eventXP[event.uniqueXP] += eventInteraction * (user.skillLevel(event.uniqueXP) / 2);
				eventXP[SkillsEnum.Woodcutting] += eventInteraction * (userWcLevel * 1.35);
				break;
			case 8: // Enchantment Ritual
				eventInteraction = randInt(6, 8); // ritual circles
				if (roll(garlandChance)) {
					loot.add('Petal garland');
				}
				eventCounts[event.id]++;
				eventXP[event.uniqueXP] += user.skillLevel(event.uniqueXP) * eventInteraction * 5.5;
				break;
			case 9: // Pheasant Control
				eventInteraction = randInt(15, 45); // eggs delivered
				for (let i = 0; i < eventInteraction; i++) {
					if (percentChance(50)) {
						loot.add('Pheasant tail feathers');
					}
					if (roll(eggChance)) {
						loot.add('Golden pheasant egg');
					}
				}
				eventCounts[event.id]++;
				eventXP[event.uniqueXP] += eventInteraction * (user.skillLevel(event.uniqueXP) / 2);
				eventXP[SkillsEnum.Woodcutting] += eventInteraction * (userWcLevel * 1.1);
				break;
		}
		// Give user Anima-infused bark per event
		loot.add('Anima-infused bark', randInt(250, 500));
	});

	let totalEvents = 0;
	for (const [event, count] of objectEntries(eventCounts)) {
		if (event && count && count > 0) {
			totalEvents += count;
			await userStatsBankUpdate(user.id, 'forestry_event_completions_bank', new Bank().add(Number(event), count));
		}
	}

	// Give user xp from events
	let xpRes = '';
	for (const [key, val] of objectEntries(eventXP)) {
		if (key && val && val > 0) {
			xpRes += await user.addXP({
				skillName: key,
				amount: Math.ceil(val),
				minimal: true,
				source: 'ForestryEvents'
			});
		}
	}

	// Generate forestry message
	const completedEvents = Object.entries(eventCounts)
		.map(([eventId, count]) => {
			const event = ForestryEvents.find(e => e.id === Number.parseInt(eventId));
			return count > 0 ? `${count} ${event?.name}` : null;
		})
		.filter(Boolean)
		.join(' & ');
	strForestry += `${
		totalEvents > 0 ? `Completed Forestry event${totalEvents > 1 ? 's:' : ':'} ${completedEvents}. ${xpRes}\n` : ''
	}`;
	strForestry += `${
		loot.has('Sturdy beehive parts') && !user.cl.has('Sturdy beehive parts') // only show this message once to reduce spam
			? '- The temporary beehive was made so well you could repurpose parts of it to build a permanent hive.\n'
			: ''
	}`;
	strForestry += `${
		loot.has('Golden pheasant egg')
			? '- You feel a connection to the pheasants as if one wishes to travel with you...\n'
			: ''
	}`;
	strForestry += `${
		loot.has('Fox whistle') ? '- You feel a connection to the fox as if it wishes to travel with you...\n' : ''
	}`;
	strForestry += `${loot.has('Petal garland') ? '- The Dryad also hands you a Petal garland.\n' : ''}`;

	return strForestry;
}

export const woodcuttingTask: MinionTask = {
	type: 'Woodcutting',
	async run(data: WoodcuttingActivityTaskOptions) {
		const { logID, quantity, userID, channelID, duration, powerchopping, forestry, twitchers } = data;
		const user = await mUserFetch(userID);
		const userWcLevel = user.skillLevel(SkillsEnum.Woodcutting);
		const log = Woodcutting.Logs.find(i => i.id === logID)!;
		const forestersRations = user.bank.amount("Forester's ration");
		const wcCapeNestBoost =
			user.hasEquipped('Woodcutting cape') ||
			(user.hasEquipped('Forestry basket') &&
				user.bank.has(['Woodcutting cape', 'Cape pouch']) &&
				userWcLevel >= 99);

		const strungRabbitFoot = user.hasEquipped('Strung rabbit foot');
		const twitchersEquipped = user.hasEquipped("twitcher's gloves");
		let twitcherSetting: TwitcherGloves | undefined = 'egg';
		let xpReceived = quantity * log.xp;
		let bonusXP = 0;
		let rationUsed = 0;
		let lostLogs = 0;
		const loot = new Bank();
		const itemsToRemove = new Bank();
		const priffUnlocked = user.hasSkillReqs(soteSkillRequirements) && user.QP >= 150;

		// GMC for elder logs
		let clueChance = log.clueScrollChance;
		if (logID === itemID('Elder logs')) {
			// Bring it as close as possible to Rocktails
			if (userWcLevel >= MAX_LEVEL) clueChance = 13_011;
		}

		// Felling axe +10% xp bonus & 20% logs lost
		if (user.gear.skilling.hasEquipped('Bronze felling axe')) {
			for (let i = 0; i < quantity && i < forestersRations; i++) {
				rationUsed++;
				if (percentChance(20)) {
					lostLogs++;
				}
			}
			const fellingXP = Math.floor(rationUsed * log.xp * 0.1);
			xpReceived += fellingXP;
			bonusXP += fellingXP;
			itemsToRemove.add("Forester's ration", rationUsed);
		}

		// If they have the entire lumberjack outfit, give an extra 0.5% xp bonus
		if (
			user.hasEquippedOrInBank(
				Object.keys(Woodcutting.lumberjackItems).map(i => Number.parseInt(i)),
				'every'
			)
		) {
			const amountToAdd = Math.floor(xpReceived * (2.5 / 100));
			xpReceived += amountToAdd;
			bonusXP += amountToAdd;
		} else {
			// For each lumberjack item, check if they have it, give its XP boost if so
			for (const [itemID, bonus] of Object.entries(Woodcutting.lumberjackItems)) {
				if (user.hasEquippedOrInBank(Number.parseInt(itemID))) {
					const amountToAdd = Math.floor(xpReceived * (bonus / 100));
					xpReceived += amountToAdd;
					bonusXP += amountToAdd;
				}
			}
		}

		// Give the user xp
		let xpRes = await user.addXP({
			skillName: SkillsEnum.Woodcutting,
			amount: Math.ceil(xpReceived),
			duration
		});

		// Add Logs or loot
		if (!powerchopping) {
			if (log.lootTable) {
				loot.add(log.lootTable.roll(quantity - lostLogs));
			} else if (!log.hasNoLoot) {
				loot.add(log.id, quantity - lostLogs);
				const logItem = Firemaking.Burnables.find(i => i.inputLogs === log.id);
				if (user.hasEquipped('Inferno adze') && logItem) {
					loot.remove(log.id, quantity - lostLogs);
					loot.add('Ashes', quantity - lostLogs);
					xpRes += '\n';
					xpRes += await user.addXP({
						skillName: SkillsEnum.Firemaking,
						amount: logItem.xp * quantity,
						duration
					});
				}
			}
		}

		// Add leaves
		if (log.leaf && user.hasEquippedOrInBank('Forestry kit')) {
			for (let i = 0; i < quantity; i++) {
				if (percentChance(25)) {
					loot.add(log.leaf, 1);
				}
			}
		}

		// Add crystal shards for chopping teaks/mahogany in priff
		if (forestry && priffUnlocked && resolveItems(['Teak logs', 'Mahogany logs']).includes(log.id)) {
			// 15 Shards per hour
			loot.add('Crystal shard', Math.floor((duration / Time.Hour) * 15));
		}

		// WC master cape perk
		if (user.hasEquippedOrInBank('Woodcutting master cape')) {
			loot.multiply(2);
		}

		// Check for twitcher gloves
		if (twitchersEquipped) {
			if (twitchers !== undefined) {
				twitcherSetting = twitchers;
			}
		} else {
			twitcherSetting = undefined;
		}

		// Add clue scrolls
		if (clueChance) {
			addSkillingClueToLoot(
				user,
				SkillsEnum.Woodcutting,
				quantity,
				clueChance,
				loot,
				log.clueNestsOnly,
				strungRabbitFoot,
				twitcherSetting,
				wcCapeNestBoost
			);
		}

		// End of trip message
		let str = `${user}, ${user.minionName} finished woodcutting. ${xpRes}${
			bonusXP > 0 ? ` **Bonus XP:** ${bonusXP.toLocaleString()}` : ''
		}\n`;

		if (!log.clueNestsOnly) {
			if (wcCapeNestBoost) {
				str += `Your ${
					user.hasEquipped('Woodcutting cape') ? 'Woodcutting cape' : 'Forestry basket'
				} increases the chance of receiving bird nests.\n`;
			}
			if (strungRabbitFoot) {
				str +=
					'Your Strung rabbit foot necklace increases the chance of receiving bird egg nests and ring nests.\n';
			}
			if (twitcherSetting !== undefined) {
				str += `Your Twitcher's gloves increases the chance of receiving ${twitcherSetting} nests.\n`;
			}
		} else if (twitcherSetting === 'clue') {
			str += `Your Twitcher's gloves increases the chance of receiving ${twitcherSetting} nests.\n`;
		}

		// Forestry events
		if (forestry) {
			str += await handleForestry({ user, duration, loot });
		}

		// Roll for Peky
		if (duration >= MIN_LENGTH_FOR_PET) {
			const minutes = duration / Time.Minute;
			const droprate = clAdjustedDroprate(user, 'Peky', Math.floor(4000 / minutes), 1.5);
			if (roll(droprate)) {
				loot.add('Peky');
				str +=
					'\n<:peky:787028037031559168> A small pigeon has taken a liking to you, and hides itself in your bank.';
			}
		}

		// Roll for OSB pet
		if (log.petChance) {
			const { petDropRate } = skillingPetDropRate(user, SkillsEnum.Woodcutting, log.petChance);
			if (roll(petDropRate / quantity)) {
				loot.add('Beaver');
				str += "\n**You have a funny feeling you're being followed...**";
			}
		}

		// Update cl, give loot, and remove items used
		const res = await transactItems({
			userID: user.id,
			collectionLog: true,
			itemsToAdd: loot,
			itemsToRemove
		});
		// Loot received, items used, and logs/loot rolls lost message
		str += `\nYou received ${res.itemsAdded}. `;
		str += `${itemsToRemove.length > 0 ? `You used ${itemsToRemove}. ` : ''}`;

		return handleTripFinish(user, channelID, str, undefined, data, loot);
	}
};
