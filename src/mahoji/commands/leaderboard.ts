import { type CommandRunOptions, toTitleCase } from '@oldschoolgg/toolkit';

import type { UserStats } from '@prisma/client';
import { ApplicationCommandOptionType, type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { calcWhatPercent, chunk } from 'e';
import { type ClueTier, ClueTiers } from '../../lib/clues/clueTiers';
import { allClNames, getCollectionItems } from '../../lib/data/Collections';
import { effectiveMonsters } from '../../lib/minions/data/killableMonsters';
import { allOpenables } from '../../lib/openables';
import { Minigames } from '../../lib/settings/minigames';

import Skills from '../../lib/skilling/skills';
import Agility from '../../lib/skilling/skills/agility';
import Hunter from '../../lib/skilling/skills/hunter/hunter';
import { SkillsEnum } from '../../lib/skilling/types';
import {
	channelIsSendable,
	convertXPtoLVL,
	formatDuration,
	getUsername,
	makePaginatedMessage,
	stringMatches
} from '../../lib/util';
import { fetchCLLeaderboard, fetchTameCLLeaderboard } from '../../lib/util/clLeaderboard';
import { deferInteraction } from '../../lib/util/interactionReply';
import { userEventsToMap } from '../../lib/util/userEvents';
import { sendToChannelID } from '../../lib/util/webhook';
import type { OSBMahojiCommand } from '../lib/util';

const LB_PAGE_SIZE = 10;

function lbMsg(str: string) {
	;
	return {
		content: `Showing you the ${str} leaderboard, click the buttons to change pages.`,
		ephemeral: true
	};
}

export function getPos(page: number, record: number) {
	return `${page * LB_PAGE_SIZE + 1 + record}. `;
}

export async function doMenu(
	interaction: ChatInputCommandInteraction,
	user: MUser,
	channelID: string,
	pages: string[],
	title: string
) {
	if (pages.length === 0) {
		return sendToChannelID(interaction.channelId, { content: 'There are no users on this leaderboard.' });
	}
	const channel = globalClient.channels.cache.get(channelID);
	if (!channelIsSendable(channel)) return;

	makePaginatedMessage(
		channel,
		pages.map(p => ({ embeds: [new EmbedBuilder().setTitle(title).setDescription(p)] })),
		user.id
	);
}

async function kcLb(
	interaction: ChatInputCommandInteraction,
	user: MUser,
	channelID: string,
	name: string,
	
) {
	;
	const monster = effectiveMonsters.find(mon => [mon.name, ...mon.aliases].some(alias => stringMatches(alias, name)));
	if (!monster) return "That's not a valid monster!";
	const list = await prisma.$queryRawUnsafe<{ id: string; kc: number }[]>(
		`SELECT user_id::text AS id, CAST("monster_scores"->>'${monster.id}' AS INTEGER) as kc
		 FROM user_stats
		 WHERE CAST("monster_scores"->>'${monster.id}' AS INTEGER) > 5
		 ORDER BY kc DESC
		 LIMIT 2000;`
	);

	doMenu(
		interaction,
		user,
		channelID,
		chunk(list, LB_PAGE_SIZE).map((subList, i) =>
			subList
				.map((user, j) => `${getPos(i, j)}**${getUsername(user.id)}:** ${user.kc.toLocaleString()}`)
				.join('\n')
		),
		`KC Leaderboard for ${monster.name}`
	);

	return lbMsg(`${monster.name} KC `);
}

async function farmingContractLb(
	interaction: ChatInputCommandInteraction,
	user: MUser,
	channelID: string,
	
) {
	;
	const list = await prisma.$queryRawUnsafe<{ id: string; count: number }[]>(
		`SELECT id, CAST("minion.farmingContract"->>'contractsCompleted' AS INTEGER) as count
		 FROM users
		 WHERE "minion.farmingContract" is not null and CAST ("minion.farmingContract"->>'contractsCompleted' AS INTEGER) >= 1
		
		 ORDER BY count DESC
		 LIMIT 2000;`
	);

	doMenu(
		interaction,
		user,
		channelID,
		chunk(list, LB_PAGE_SIZE).map((subList, i) =>
			subList
				.map(({ id, count }, j) => {
					return `${getPos(i, j)}**${getUsername(id)}:** ${count.toLocaleString()}`;
				})
				.join('\n')
		),
		'Farming Contracts Leaderboard'
	);
	return lbMsg('Farming Contract');
}

async function infernoLb() {
	const res = await prisma.$queryRawUnsafe<{ user_id: string; duration: number }[]>(`SELECT user_id, duration
FROM activity
WHERE type = 'Inferno'
AND data->>'deathTime' IS NULL
AND completed = true
ORDER BY duration ASC
LIMIT 10;`);

	if (res.length === 0) {
		return 'No results.';
	}

	return `**Inferno Records**\n\n${res
		.map((e, i) => `${i + 1}. **${getUsername(e.user_id)}:** ${formatDuration(e.duration)}`)
		.join('\n')}`;
}
// Leaderboard for BSO general boxSpawn.ts event
async function bsoChallenge(interaction: ChatInputCommandInteraction, user: MUser, channelID: string) {
	const challengeCount: { id: string; challengescore: number }[] = await prisma.$queryRawUnsafe(
		`SELECT u.user_id::text AS id, u.challengescore
		FROM (
			SELECT COALESCE(main_server_challenges_won, 0) AS challengescore, user_id
			FROM user_stats
		) AS u
		ORDER BY u.challengescore DESC
		LIMIT 100;`
	);

	doMenu(
		interaction,
		user,
		channelID,
		chunk(challengeCount, LB_PAGE_SIZE).map((subList, i) =>
			subList
				.map(
					({ id, challengescore }, j) =>
						`${getPos(i, j)}**${getUsername(id)}:** ${challengescore.toLocaleString()} Challenges`
				)
				.join('\n')
		),
		'Top Challenges Won Leaderboard'
	);
	return lbMsg('Top Challenges Won');
}

async function sacrificeLb(
	interaction: ChatInputCommandInteraction,
	user: MUser,
	channelID: string,
	type: 'value' | 'unique',
	
) {
	;
	if (type === 'value') {
		const list = (
			await prisma.$queryRawUnsafe<{ id: string; amount: number }[]>(
				`SELECT "id", "sacrificedValue"
					   FROM users
					   WHERE "sacrificedValue" > 0
					   
					   ORDER BY "sacrificedValue"
					   DESC LIMIT 2000;`
			)
		).map((res: any) => ({ ...res, amount: Number.parseInt(res.sacrificedValue) }));

		doMenu(
			interaction,
			user,
			channelID,
			chunk(list, LB_PAGE_SIZE).map((subList, i) =>
				subList
					.map(({ id, amount }, j) => `${getPos(i, j)}**${getUsername(id)}:** ${amount.toLocaleString()} GP `)
					.join('\n')
			),
			'Sacrifice Leaderboard'
		);

		return lbMsg('Most Value Sacrificed');
	}

	const mostUniques: { id: string; sacbanklength: number }[] = await prisma.$queryRawUnsafe(
		`SELECT u.user_id::text AS id, u.sacbanklength
				FROM (
  					SELECT (SELECT COUNT(*)::int FROM JSONB_OBJECT_KEYS(sacrificed_bank)) sacbanklength, user_id FROM user_stats
				) u
				ORDER BY u.sacbanklength DESC LIMIT 10;
`
	);
	doMenu(
		interaction,
		user,
		channelID,
		chunk(mostUniques, LB_PAGE_SIZE).map((subList, i) =>
			subList
				.map(
					({ id, sacbanklength }, j) =>
						`${getPos(i, j)}**${getUsername(id)}:** ${sacbanklength.toLocaleString()} Unique Sac's`
				)
				.join('\n')
		),
		'Unique Sacrifice Leaderboard'
	);
	return lbMsg('Unique Sacrifice');
}

async function minigamesLb(interaction: ChatInputCommandInteraction, user: MUser, channelID: string, name: string) {
	const minigame = Minigames.find(m => stringMatches(m.name, name) || m.aliases.some(a => stringMatches(a, name)));
	if (!minigame) {
		return `That's not a valid minigame. Valid minigames are: ${Minigames.map(m => m.name).join(', ')}.`;
	}

	if (minigame.name === 'Tithe farm') {
		const titheCompletions = await prisma.$queryRawUnsafe<{ id: string; amount: number }[]>(
			`SELECT user_id::text as id, tithe_farms_completed::int as amount
					   FROM user_stats
					   WHERE "tithe_farms_completed" > 10
					   ORDER BY "tithe_farms_completed"
					   DESC LIMIT 10;`
		);
		doMenu(
			interaction,
			user,
			channelID,
			chunk(titheCompletions, LB_PAGE_SIZE).map((subList, i) =>
				subList
					.map(({ id, amount }, j) => `${getPos(i, j)}**${getUsername(id)}:** ${amount.toLocaleString()}`)
					.join('\n')
			),
			'Tithe farm Leaderboard'
		);
		return lbMsg(`${minigame.name} Leaderboard`);
	}
	const res = await prisma.minigame.findMany({
		where: {
			[minigame.column]: {
				gt: minigame.column === 'champions_challenge' ? 1 : 10
			}
		},
		orderBy: {
			[minigame.column]: 'desc'
		},
		take: 10
	});

	doMenu(
		interaction,
		user,
		channelID,
		chunk(res, LB_PAGE_SIZE).map((subList, i) =>
			subList
				.map((u, j) => `${getPos(i, j)}**${getUsername(u.user_id)}:** ${u[minigame.column].toLocaleString()}`)
				.join('\n')
		),
		`${minigame.name} Leaderboard`
	);
	return lbMsg(`${minigame.name} Leaderboard`);
}

async function clLb(
	interaction: ChatInputCommandInteraction,
	user: MUser,
	channelID: string,
	inputType: string,
	tames: boolean
) {
	const { resolvedCl, items } = getCollectionItems(inputType, false, false, true);
	if (!items || items.length === 0) {
		return "That's not a valid collection log category. Check +cl for all possible logs.";
	}
	inputType = toTitleCase(inputType.toLowerCase());

	if (tames) {
		const tameLb = await fetchTameCLLeaderboard({ items, resultLimit: 200 });
		doMenu(
			interaction,
			user,
			channelID,
			chunk(tameLb, LB_PAGE_SIZE).map((subList, i) =>
				subList
					.map(({ user_id, qty }, j) => `${getPos(i, j)}**${getUsername(user_id)}:** ${qty.toLocaleString()}`)
					.join('\n')
			),
			`${inputType} Tame Collection Log Leaderboard (${items.length} slots)`
		);
		return lbMsg(`${inputType} Tame Collection Log Leaderboard`);
	}

	const userEventOrders = await prisma.userEvent.findMany({
		where: {
			type: 'CLCompletion',
			collection_log_name: resolvedCl.toLowerCase()
		},
		orderBy: {
			date: 'asc'
		}
	});

	const users = await fetchCLLeaderboard({  items, resultLimit: 200, userEvents: userEventOrders });
	doMenu(
		interaction,
		user,
		channelID,
		chunk(users, LB_PAGE_SIZE).map((subList, i) =>
			subList
				.map(
					({ id, qty }, j) =>
						`${getPos(i, j)}**${getUsername(id)}:** ${qty.toLocaleString()} (${calcWhatPercent(
							qty,
							items.length
						).toFixed(1)}%)`
				)
				.join('\n')
		),
		`${inputType} Collection Log Leaderboard (${items.length} slots)`
	);
	return lbMsg(`${inputType} Collection Log Leaderboard`);
}

async function creaturesLb(
	interaction: ChatInputCommandInteraction,
	user: MUser,
	channelID: string,
	creatureName: string
) {
	const creature = Hunter.Creatures.find(creature =>
		creature.aliases.some(
			alias => stringMatches(alias, creatureName) || stringMatches(alias.split(' ')[0], creatureName)
		)
	);

	if (!creature) return 'Thats not a valid creature.';

	const query = `SELECT user_id::text as id, ("creature_scores"->>'${creature.id}')::int as count
				   FROM user_stats WHERE "creature_scores"->>'${creature.id}' IS NOT NULL
				   ORDER BY count DESC LIMIT 50;`;
	const data: { id: string; count: number }[] = await prisma.$queryRawUnsafe(query);
	doMenu(
		interaction,
		user,
		channelID,
		chunk(data, LB_PAGE_SIZE).map((subList, i) =>
			subList
				.map(({ id, count }, j) => `${getPos(i, j)}**${getUsername(id)}:** ${count.toLocaleString()}`)
				.join('\n')
		),
		`Catch Leaderboard for ${creature.name}`
	);
	return lbMsg(`${creature.name} Catch Leaderboard`);
}

async function lapsLb(interaction: ChatInputCommandInteraction, user: MUser, channelID: string, courseName: string) {
	const course = Agility.Courses.find(course => course.aliases.some(alias => stringMatches(alias, courseName)));

	if (!course) return 'Thats not a valid agility course.';

	const data: { id: string; count: number }[] = await prisma.$queryRawUnsafe(
		`SELECT user_id::text as id, ("laps_scores"->>'${course.id}')::int as count
			 FROM user_stats
			 WHERE "laps_scores"->>'${course.id}' IS NOT NULL
			 ORDER BY count DESC LIMIT 50;`
	);
	doMenu(
		interaction,
		user,
		channelID,
		chunk(data, LB_PAGE_SIZE).map((subList, i) =>
			subList
				.map(({ id, count }, j) => `${getPos(i, j)}**${getUsername(id)}:** ${count.toLocaleString()}`)
				.join('\n')
		),
		`${course.name} Laps Leaderboard`
	);
	return lbMsg(`${course.name} Laps`);
}

async function openLb(
	interaction: ChatInputCommandInteraction,
	user: MUser,
	channelID: string,
	name: string,
	
) {
	if (name) {
		name = name.trim();
	}

	let entityID = -1;
	let key = '';
	let openableName = '';

	const openable = !name
		? undefined
		: allOpenables.find(
				item => stringMatches(item.name, name) || item.name.toLowerCase().includes(name.toLowerCase())
			);
	if (openable) {
		entityID = openable.id;
		key = 'openable_scores';
		openableName = openable.name;
	}

	if (entityID === -1) {
		return `That's not a valid openable item! You can check: ${allOpenables.map(i => i.name).join(', ')}.`;
	}

	const list = await prisma.$queryRawUnsafe<{ id: string; qty: number }[]>(
		`SELECT user_id::text AS id, ("${key}"->>'${entityID}')::int as qty FROM user_stats
			WHERE ("${key}"->>'${entityID}')::int > 3
			ORDER BY qty DESC LIMIT 30;`
	);

	doMenu(
		interaction,
		user,
		channelID,
		chunk(list, LB_PAGE_SIZE).map((subList, i) =>
			subList
				.map((user, j) => `${getPos(i, j)}**${getUsername(user.id)}:** ${user.qty.toLocaleString()}`)
				.join('\n')
		),
		`Open Leaderboard for ${openableName}`
	);
	return lbMsg(`${openableName} Opening`);
}

async function gpLb(interaction: ChatInputCommandInteraction, user: MUser, channelID: string, ) {
	;
	const users = (
		await prisma.$queryRawUnsafe<{ id: string; GP: number }[]>(
			`SELECT "id", "GP"
					   FROM users
					   WHERE "GP" > 1000000
					  
					   ORDER BY "GP" DESC
					   LIMIT 500;`
		)
	).map(res => ({ ...res, GP: Number(res.GP) }));

	doMenu(
		interaction,
		user,
		channelID,
		chunk(users, LB_PAGE_SIZE).map((subList, i) =>
			subList
				.map(({ id, GP }, j) => `${getPos(i, j)}**${getUsername(id)}:** ${GP.toLocaleString()} GP`)
				.join('\n')
		),
		'GP Leaderboard'
	);
	return lbMsg('GP Leaderboard');
}

async function skillsLb(
	interaction: ChatInputCommandInteraction,
	user: MUser,
	channelID: string,
	inputSkill: string,
	type: 'xp' | 'level',
) {
	let res = [];
	let overallUsers: {
		id: string;
		totalLevel: number;
		ironman: boolean;
		totalXP: number;
	}[] = [];

	const skillsVals = Object.values(Skills);

	const skill = skillsVals.find(_skill => _skill.aliases.some(name => stringMatches(name, inputSkill)));

	if (inputSkill === 'overall') {
		const maxTotalLevelEventMap = await prisma.userEvent
			.findMany({
				where: {
					type: 'MaxTotalLevel'
				},
				orderBy: {
					date: 'asc'
				}
			})
			.then(res => userEventsToMap(res));
		const query = `SELECT
								u.id,
								${skillsVals.map(s => `"skills.${s.id}"`)},
								${skillsVals.map(s => `"skills.${s.id}"::int8`).join(' + ')} as totalxp,
								u."minion.ironman"
							FROM
								users u
							
							ORDER BY totalxp DESC
							LIMIT 2000;`;
		res = await prisma.$queryRawUnsafe<Record<string, any>[]>(query);
		overallUsers = res.map(user => {
			let totalLevel = 0;
			for (const skill of skillsVals) {
				totalLevel += convertXPtoLVL(Number(user[`skills.${skill.id}`]) as any, 120);
			}
			return {
				id: user.id,
				totalLevel,
				ironman: user['minion.ironman'],
				totalXP: Number(user.totalxp!)
			};
		});
		if (type === 'level') {
			overallUsers.sort((a, b) => {
				const valueDifference = b.totalLevel - a.totalLevel;
				if (valueDifference !== 0) {
					return valueDifference;
				}
				const xpDiff = b.totalXP - a.totalXP;
				if (xpDiff !== 0) {
					return xpDiff;
				}
				const dateA = maxTotalLevelEventMap.get(a.id);
				const dateB = maxTotalLevelEventMap.get(b.id);
				if (dateA && dateB) {
					return dateA - dateB;
				}
				if (dateA) {
					return -1;
				}
				if (dateB) {
					return 1;
				}
				return 0;
			});
		}
		overallUsers.slice(0, 100);
	} else {
		if (!skill) return "That's not a valid skill.";

		const query = `SELECT
								u."skills.${skill.id}", u.id, u."minion.ironman"
							FROM
								users u
							
							ORDER BY
								1 DESC
							LIMIT 2000;`;
		res = await prisma.$queryRawUnsafe<Record<string, any>[]>(query);

		const events = await prisma.userEvent.findMany({
			where: {
				type: 'MaxXP',
				skill: skill.id
			},
			orderBy: {
				date: 'asc'
			}
		});
		const userEventMap = userEventsToMap(events);
		res.sort((a, b) => {
			const aXP = Number(a[`skills.${skill.id}`]);
			const bXP = Number(b[`skills.${skill.id}`]);
			const valueDifference = bXP - aXP;
			if (valueDifference !== 0) {
				return valueDifference;
			}
			const dateA = userEventMap.get(a.id);
			const dateB = userEventMap.get(b.id);
			if (dateA && dateB) {
				return dateA - dateB;
			}
			if (dateA) {
				return -1;
			}
			if (dateB) {
				return 1;
			}
			return 0;
		});
	}

	if (inputSkill === 'overall') {
		doMenu(
			interaction,
			user,
			channelID,
			chunk(overallUsers, LB_PAGE_SIZE).map((subList, i) =>
				subList
					.map((obj, j) => {
						return `${getPos(i, j)}**${getUsername(
							obj.id
						)}:** ${obj.totalLevel.toLocaleString()} (${obj.totalXP.toLocaleString()} XP)`;
					})
					.join('\n')
			),
			`Overall ${type} Leaderboard`
		);
		return lbMsg(`Overall ${type}`);
	}

	doMenu(
		interaction,
		user,
		channelID,
		chunk(res, LB_PAGE_SIZE).map((subList, i) =>
			subList
				.map((obj, j) => {
					const objKey = `skills.${skill?.id}`;
					const skillXP = Number(obj[objKey] ?? 0);

					return `${getPos(i, j)}**${getUsername(obj.id)}:** ${skillXP.toLocaleString()} XP (${convertXPtoLVL(
						skillXP,
						120
					)})`;
				})
				.join('\n')
		),
		`${skill ? toTitleCase(skill.id) : 'Overall'} Leaderboard`
	);
	return lbMsg(`Overall ${skill?.name} ${type}`);
}

async function cluesLb(
	interaction: ChatInputCommandInteraction,
	user: MUser,
	channelID: string,
	clueTierName: string,
	
) {
	;
	const clueTier = ClueTiers.find(i => stringMatches(i.name, clueTierName));
	if (!clueTier) return "That's not a valid clue tier.";
	const { id } = clueTier;
	const users = (
		await prisma.$queryRawUnsafe<{ id: string; score: number }[]>(
			`SELECT id, ("collectionLogBank"->>'${id}')::int AS score
FROM users
WHERE "collectionLogBank"->>'${id}' IS NOT NULL
AND ("collectionLogBank"->>'${id}')::int > 25
ORDER BY ("collectionLogBank"->>'${id}')::int DESC
LIMIT 50;`
		)
	).map(res => ({ ...res, score: Number(res.score) }));

	doMenu(
		interaction,
		user,
		channelID,
		chunk(users, LB_PAGE_SIZE).map((subList, i) =>
			subList
				.map(({ id, score }, j) => `${getPos(i, j)}**${getUsername(id)}:** ${score.toLocaleString()} Completed`)
				.join('\n')
		),
		`${clueTier.name} Clue Leaderboard`
	);
	return lbMsg('Clue Leaderboard', );
}

async function compLeaderboard(
	interaction: ChatInputCommandInteraction,
	user: MUser,
	untrimmed: boolean,
	channelID: string
) {
	const key: keyof UserStats = untrimmed ? 'untrimmed_comp_cape_percent' : 'comp_cape_percent';
	const list = await prisma.$queryRawUnsafe<{ id: string; percent: number }[]>(
		`SELECT user_id::text AS id, ${key} AS percent
		 FROM user_stats
		 WHERE ${key} IS NOT NULL
		 ORDER BY ${key} DESC
		 LIMIT 100;`
	);

	doMenu(
		interaction,
		user,
		channelID,
		chunk(list, 10).map(subList =>
			subList
				.map(
					({ id, percent }) =>
						`**${getUsername(id)}:** ${percent.toFixed(2)}% ${untrimmed ? 'Untrimmed' : 'Trimmed'}`
				)
				.join('\n')
		),
		'Completionist Leaderboard'
	);
	return lbMsg('Completionist Leaderboard');
}

async function leaguesLeaderboard(interaction: ChatInputCommandInteraction, user: MUser, channelID: string) {
	const result: { id: number; tasks_completed: number }[] = await prisma.$queryRaw`SELECT id::text, COALESCE(cardinality(leagues_completed_tasks_ids), 0) AS tasks_completed
										  FROM public.user
										  ORDER BY tasks_completed DESC
										  LIMIT 100;`;
	doMenu(
		interaction,
		user,
		channelID,
		chunk(result, 10).map(subList =>
			subList
				.map(
					({ id, tasks_completed }) =>
						`**${getUsername(id.toString())}:** ${tasks_completed.toLocaleString()} Tasks`
				)
				.join('\n')
		),
		'Leagues Tasks Leaderboard'
	);
	return lbMsg('Leagues Tasks');
}

async function caLb(interaction: ChatInputCommandInteraction, user: MUser, channelID: string) {
	const users = (
		await prisma.$queryRawUnsafe<{ id: string; qty: number }[]>(
			`SELECT id, CARDINALITY(completed_ca_task_ids) AS qty
FROM users
WHERE CARDINALITY(completed_ca_task_ids) > 0
ORDER BY CARDINALITY(completed_ca_task_ids) DESC
LIMIT 50;`
		)
	).map(res => ({ ...res, score: Number(res.qty) }));

	doMenu(
		interaction,
		user,
		channelID,
		chunk(users, LB_PAGE_SIZE).map((subList, i) =>
			subList
				.map(
					({ id, qty }, j) => `${getPos(i, j)}**${getUsername(id)}:** ${qty.toLocaleString()} Tasks Completed`
				)
				.join('\n')
		),
		'Combat Achievements Leaderboard'
	);
	return lbMsg('Combat Achievements Leaderboard');
}

async function masteryLb(interaction: ChatInputCommandInteraction, user: MUser, channelID: string) {
	const users = await prisma.user.findMany({
		where: {
			mastery: { not: 0 }
		},
		orderBy: {
			mastery: 'desc'
		},
		take: 50,
		select: {
			id: true,
			mastery: true
		}
	});

	doMenu(
		interaction,
		user,
		channelID,
		chunk(users, LB_PAGE_SIZE).map((subList, i) =>
			subList
				.map((lUser, j) => `${getPos(i, j)}**${getUsername(lUser.id)}:** ${lUser.mastery.toFixed(3)}% mastery`)
				.join('\n')
		),
		'Mastery Leaderboard'
	);
	return lbMsg('Mastery Leaderboard');
}

export const leaderboardCommand: OSBMahojiCommand = {
	name: 'lb',
	description: 'Simulate killing monsters.',
	options: [
		{
			type: ApplicationCommandOptionType.Subcommand,
			name: 'kc',
			description: 'Check the kc leaderboard.',
			options: [
				{
					type: ApplicationCommandOptionType.String,
					name: 'monster',
					description: 'The monster you want to check the leaderboard of.',
					required: true,
					autocomplete: async value => {
						return effectiveMonsters
							.filter(m => (!value ? true : m.name.toLowerCase().includes(value.toLowerCase())))
							.map(i => ({ name: i.name, value: i.name }));
					}
				}
			]
		},
		{
			type: ApplicationCommandOptionType.Subcommand,
			name: 'farming_contracts',
			description: 'Check the farming contracts leaderboard.'
		},
		{
			type: ApplicationCommandOptionType.Subcommand,
			name: 'inferno',
			description: 'Check the inferno leaderboard.'
		},
		{
			type: ApplicationCommandOptionType.Subcommand,
			name: 'sacrifice',
			description: 'Check the sacrifice leaderboard.',
			options: [
				{
					type: ApplicationCommandOptionType.String,
					name: 'type',
					description: 'The particular sacrifice leaderboard you want to check.',
					required: true,
					choices: [
						{ name: 'Most Value Sacrificed', value: 'value' },
						{ name: 'Unique Items Sacrificed', value: 'unique' }
					]
				}
			]
		},
		{
			type: ApplicationCommandOptionType.Subcommand,
			name: 'minigames',
			description: 'Check the minigames leaderboard.',
			options: [
				{
					type: ApplicationCommandOptionType.String,
					name: 'minigame',
					description: 'The particular minigame leaderboard you want to check.',
					required: true,
					autocomplete: async (value: string) => {
						return Minigames.filter(i =>
							!value
								? true
								: [i.name, ...i.aliases].some(str => str.toLowerCase().includes(value.toLowerCase()))
						).map(i => ({ name: i.name, value: i.name }));
					}
				}
			]
		},
		{
			type: ApplicationCommandOptionType.Subcommand,
			name: 'hunter_catches',
			description: 'Check the hunter catch leaderboard.',
			options: [
				{
					type: ApplicationCommandOptionType.String,
					name: 'creature',
					description: 'The particular creature you want to check.',
					required: true,
					autocomplete: async (value: string) => {
						return Hunter.Creatures.filter(i =>
							!value
								? true
								: [i.name, ...i.aliases].some(str => str.toLowerCase().includes(value.toLowerCase()))
						).map(i => ({ name: i.name, value: i.name }));
					}
				}
			]
		},
		{
			type: ApplicationCommandOptionType.Subcommand,
			name: 'agility_laps',
			description: 'Check the agility laps leaderboard.',
			options: [
				{
					type: ApplicationCommandOptionType.String,
					name: 'course',
					description: 'The particular creature you want to check.',
					required: true,
					autocomplete: async (value: string) => {
						return Agility.Courses.filter(i =>
							!value
								? true
								: [i.name, ...i.aliases].some(str => str.toLowerCase().includes(value.toLowerCase()))
						).map(i => ({ name: i.name, value: i.name }));
					}
				}
			]
		},
		{
			type: ApplicationCommandOptionType.Subcommand,
			name: 'gp',
			description: 'Check the GP leaderboard.',
			options: []
		},
		{
			type: ApplicationCommandOptionType.Subcommand,
			name: 'skills',
			description: 'Check the skills/xp/levels leaderboards.',
			options: [
				{
					type: ApplicationCommandOptionType.String,
					name: 'skill',
					description: 'The skill you want to select.',
					required: true,
					autocomplete: async (value: string) => {
						return [
							{ name: 'Overall', value: 'overall' },
							...Object.values(SkillsEnum).map(i => ({ name: toTitleCase(i), value: i }))
						].filter(i => (!value ? true : i.name.toLowerCase().includes(value.toLowerCase())));
					}
				},
				{
					type: ApplicationCommandOptionType.Boolean,
					name: 'xp',
					description: 'Show XP instead of levels.',
					required: false
				}
			]
		},
		{
			type: ApplicationCommandOptionType.Subcommand,
			name: 'opens',
			description: 'Check the opening leaderboards.',
			options: [
				{
					type: ApplicationCommandOptionType.String,
					name: 'openable',
					description: 'The openable you want to select.',
					required: true,
					autocomplete: async (value: string) => {
						return allOpenables
							.filter(i =>
								!value
									? true
									: [i.name, ...i.aliases].some(str =>
											str.toLowerCase().includes(value.toLowerCase())
										)
							)
							.map(i => ({ name: i.name, value: i.name }));
					}
				}
			]
		},
		{
			type: ApplicationCommandOptionType.Subcommand,
			name: 'cl',
			description: 'Check the collection log leaderboards.',
			options: [
				{
					type: ApplicationCommandOptionType.String,
					name: 'cl',
					description: 'The cl you want to select.',
					required: true,
					autocomplete: async value => {
						return [
							{ name: 'Overall (Main Leaderboard)', value: 'overall' },
							...['overall+', ...allClNames.map(i => i)].map(i => ({
								name: toTitleCase(i),
								value: i
							}))
						].filter(o => (!value ? true : o.name.toLowerCase().includes(value.toLowerCase())));
					}
				},
				{
					type: ApplicationCommandOptionType.Boolean,
					name: 'tames',
					description: 'If you want to view the tame CL leaderboard.',
					required: false
				}
			]
		},
		{
			type: ApplicationCommandOptionType.Subcommand,
			name: 'leagues',
			description: 'Check the Leagues leaderboards.'
		},
		{
			type: ApplicationCommandOptionType.Subcommand,
			name: 'clues',
			description: 'Check the clue leaderboards.',
			options: [
				{
					type: ApplicationCommandOptionType.String,
					name: 'clue',
					description: 'The clue you want to select.',
					required: true,
					choices: ClueTiers.map(i => ({ name: i.name, value: i.name }))
				}
			]
		},
		{
			type: ApplicationCommandOptionType.Subcommand,
			name: 'completion',
			description: 'Check the completion leaderboard.',
			options: [
				{
					type: ApplicationCommandOptionType.Boolean,
					name: 'untrimmed',
					description: 'Show only untrimmed completion.',
					required: false
				}
			]
		},
		{
			type: ApplicationCommandOptionType.Subcommand,
			name: 'combat_achievements',
			description: 'Check the combat achievements leaderboards.',
			options: []
		},
		{
			type: ApplicationCommandOptionType.Subcommand,
			name: 'mastery',
			description: 'Check the mastery leaderboard.',
			options: []
		}
	],
	run: async ({
		channelID,
		options,
		userID,
		interaction
	}: CommandRunOptions<{
		kc?: { monster: string;  };
		farming_contracts?: {  };
		inferno?: {};
		challenges?: {};
		sacrifice?: { type: 'value' | 'unique';  };
		minigames?: { minigame: string;  };
		hunter_catches?: { creature: string };
		agility_laps?: { course: string };
		gp?: {  };
		skills?: { skill: string; xp?: boolean };
		opens?: { openable: string;  };
		cl?: { cl: string; tames?: boolean };
		leagues?: {};
		clues?: { clue: ClueTier['name'];  };
		completion?: { untrimmed?: boolean;  };
		combat_achievements?: {};
		mastery?: {};
	}>) => {
		await deferInteraction(interaction);
		const user = await mUserFetch(userID);
		const {
			opens,
			kc,
			farming_contracts,
			inferno,
			challenges,
			sacrifice,
			minigames,
			hunter_catches,
			agility_laps,
			gp,
			skills,
			cl,
			leagues,
			clues,
			completion,
			combat_achievements,
			mastery
		} = options;
		if (kc) return kcLb(interaction, user, channelID, kc.monster);
		if (farming_contracts) {
			return farmingContractLb(interaction, user, channelID);
		}
		if (inferno) return infernoLb();
		if (challenges) return bsoChallenge(interaction, user, channelID);
		if (sacrifice)
			return sacrificeLb(interaction, user, channelID, sacrifice.type);
		if (minigames) return minigamesLb(interaction, user, channelID, minigames.minigame);
		if (hunter_catches) return creaturesLb(interaction, user, channelID, hunter_catches.creature);
		if (agility_laps) return lapsLb(interaction, user, channelID, agility_laps.course);
		if (gp) return gpLb(interaction, user, channelID,);
		if (skills) {
			return skillsLb(
				interaction,
				user,
				channelID,
				skills.skill,
				skills.xp ? 'xp' : 'level',
			);
		}
		if (opens) return openLb(interaction, user, channelID, opens.openable, );
		if (cl) return clLb(interaction, user, channelID, cl.cl,  Boolean(cl.tames));
		if (leagues) return leaguesLeaderboard(interaction, user, channelID);
		if (clues) return cluesLb(interaction, user, channelID, clues.clue);
		if (completion)
			return compLeaderboard(
				interaction,
				user,
				Boolean(completion.untrimmed),
				channelID
			);

		if (combat_achievements) return caLb(interaction, user, channelID);
		if (mastery) return masteryLb(interaction, user, channelID);
		return 'Invalid input.';
	}
};
