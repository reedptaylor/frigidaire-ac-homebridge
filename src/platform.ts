import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import Frigidaire = require('@samthegeek/frigidaire');
import path = require('path');

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { FrigidaireHomebridgePlatformAccessory } from './platformAccessory';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class FrigidaireHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  public readonly AC: Frigidaire;
  public readonly pollingInterval: number;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Starting to initializing FrigidaireHomebridgePlatform');

    // Homebridge 1.8.0 introduced a `log.success` method that can be used to log success messages
    // For users that are on a version prior to 1.8.0, we need a 'polyfill' for this method
    if (!log.success) {
      log.success = log.info;
    }

    this.pollingInterval = this.config.pollingInterval || 10000;

    let homebridgeConfigDir: string | null = null;
    if (this.config.cacheRefreshToken) {
      homebridgeConfigDir = path.dirname(api.user.configPath());
      this.log.debug('Will cache auth token in:', homebridgeConfigDir);
    }

    this.AC = new Frigidaire({
      username: this.config.username,
      password: this.config.password,
      pollingInterval: this.pollingInterval,
      deviceId: this.config.deviceId || null,
      cacheDir: homebridgeConfigDir,
    });

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to set up event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache, so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {

    this.log.debug('Searching for devices...');

    this.AC.getDevices((err, result) => {
      if (err) {
        this.log.error(err);
        return;
      }
      this.log.debug('Successfully searched for devices:', result);
      const restoredDeviceIds: string[] = [];

      for (const device of result) {
        if (device.telem.applianceInfo.applianceType !== 'AC') {
          this.log.info('Skipping non AC device device:', device.nickname, device.telem.applianceInfo.applianceType);
          continue;
        }

        // generate a unique id for the accessory this should be generated from
        // something globally unique, but constant, for example, the device serial
        // number or MAC address
        const uuid = this.api.hap.uuid.generate(device.fullId);

        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

        if (existingAccessory) {
          // the accessory already exists
          this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
          restoredDeviceIds.push(uuid);

          // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. e.g.:
          existingAccessory.context.device = device;
          this.api.updatePlatformAccessories([existingAccessory]);

          // create the accessory handler for the restored accessory
          // this is imported from `platformAccessory.ts`
          new FrigidaireHomebridgePlatformAccessory(this, existingAccessory);
        } else {
          // the accessory does not yet exist, so we need to create it
          this.log.info('Adding new accessory:', device.nickname);

          // create a new accessory
          const accessory = new this.api.platformAccessory(device.nickname, uuid);

          // store a copy of the device object in the `accessory.context`
          // the `context` property can be used to store any data about the accessory you may need
          accessory.context.device = device;

          // create the accessory handler for the newly create accessory
          // this is imported from `platformAccessory.ts`
          new FrigidaireHomebridgePlatformAccessory(this, accessory);

          // link the accessory to your platform
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }

        this.AC.getTelem(device.sn, () => { });
      }

      // remove any accessories that are no longer present in Frigidaire App
      for (const removedAccessory of this.accessories.filter(accessory => !restoredDeviceIds.includes(accessory.UUID))) {
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [removedAccessory]);
        this.log.info('Removing existing accessory from cache:', removedAccessory.displayName);
      }
    });
  }
}
