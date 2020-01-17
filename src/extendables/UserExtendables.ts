import { Extendable, KlasaClient, ExtendableStore } from 'klasa';
import { User } from 'discord.js';

import { UserSettings, Events } from '../lib/constants';
import { Bank } from '../lib/types';
import { addBankToBank, removeItemFromBank, addItemToBank } from '../lib/util';
import clueTiers from '../lib/clueTiers';

export default class extends Extendable {
	public constructor(
		client: KlasaClient,
		store: ExtendableStore,
		file: string[],
		directory: string
	) {
		super(client, store, file, directory, { appliesTo: [User] });
	}

	get sanitizedName(this: User) {
		return `(${this.username.replace(/[()]/g, '')})[${this.id}]`;
	}

	public log(this: User, stringLog: string) {
		this.client.emit(Events.Log, `${this.sanitizedName} ${stringLog}`);
	}

	public async removeGP(this: User, amount: number) {
		await this.settings.sync(true);
		const currentGP = this.settings.get(UserSettings.GP);
		if (currentGP < amount) throw `${this.sanitizedName} doesn't have enough GP.`;
		this.log(
			`had ${amount} GP removed. BeforeBalance[${currentGP}] NewBalance[${currentGP -
				amount}]`
		);
		return await this.settings.update(UserSettings.GP, currentGP - amount);
	}

	public async addGP(this: User, amount: number) {
		await this.settings.sync(true);
		const currentGP = this.settings.get(UserSettings.GP);
		this.log(
			`had ${amount} GP added. BeforeBalance[${currentGP}] NewBalance[${currentGP + amount}]`
		);
		return await this.settings.update(UserSettings.GP, currentGP + amount);
	}

	public async addItemsToBank(this: User, items: Bank, collectionLog = false) {
		await this.settings.sync(true);

		const keys = Object.keys(items).map(x => parseInt(x));
		if (
			collectionLog &&
			keys.some(itemID => !this.settings.get(UserSettings.CollectionLog).includes(itemID))
		) {
			this.addArrayOfItemsToCollectionLog(keys);
		}

		for (const { scrollID } of clueTiers) {
			// If they didnt get any of this clue scroll in their loot, continue to next clue tier.
			if (!items[scrollID]) continue;
			const alreadyHasThisScroll = await this.hasItem(scrollID);
			if (alreadyHasThisScroll) {
				// If they already have this scroll in their bank, delete it from the loot.
				delete items[scrollID];
			} else {
				// If they dont have it in their bank, reset the amount to 1 incase they got more than 1 of the clue.
				items[scrollID] = 1;
			}
		}

		this.log(`Had items added to bank - ${JSON.stringify(items)}`);

		return await this.settings.update(
			UserSettings.Bank,
			addBankToBank(items, { ...this.settings.get(UserSettings.Bank) })
		);
	}

	public async removeItemFromBank(this: User, itemID: number, amountToRemove: number = 1) {
		await this.settings.sync(true);
		const bank = { ...this.settings.get(UserSettings.Bank) };
		if (typeof bank[itemID] === 'undefined' || bank[itemID] < amountToRemove) {
			this.client.emit(
				Events.Wtf,
				`${this.username}[${this.id}] [NEI] ${itemID} ${amountToRemove}`
			);

			throw `${this.username}[${this.id}] doesn't have enough of item[${itemID}] to remove ${amountToRemove}.`;
		}

		this.log(`had Quantity[${amountToRemove}] of ItemID[${itemID}] removed from bank.`);

		return await this.settings.update(
			UserSettings.Bank,
			removeItemFromBank(bank, itemID, amountToRemove)
		);
	}

	public async addArrayOfItemsToCollectionLog(this: User, items: number[]) {
		await this.settings.sync(true);
		const currentLog = this.settings.get(UserSettings.CollectionLog);
		const newItems = items.filter(item => !currentLog.includes(item));

		this.log(`had following items added to collection log: [${newItems.join(',')}]`);

		return await this.settings.update(UserSettings.CollectionLog, newItems);
	}

	public async incrementMonsterScore(this: User, monsterID: number, amountToAdd = 1) {
		await this.settings.sync(true);
		const currentMonsterScores = this.settings.get(UserSettings.MonsterScores);

		this.log(`had Quantity[${amountToAdd}] KC added to Monster[${monsterID}]`);

		return await this.settings.update(
			UserSettings.MonsterScores,
			addItemToBank(currentMonsterScores, monsterID, amountToAdd)
		);
	}

	public async incrementClueScore(this: User, clueID: number, amountToAdd = 1) {
		await this.settings.sync(true);
		const currentClueScores = this.settings.get(UserSettings.ClueScores);

		this.log(`had Quantity[${amountToAdd}] KC added to Clue[${clueID}]`);

		return await this.settings.update(
			UserSettings.ClueScores,
			addItemToBank(currentClueScores, clueID, amountToAdd)
		);
	}

	public async hasItem(this: User, itemID: number, amount = 1) {
		await this.settings.sync(true);

		const bank = this.settings.get(UserSettings.Bank);
		return typeof bank[itemID] !== 'undefined' && bank[itemID] >= amount;
	}
}
