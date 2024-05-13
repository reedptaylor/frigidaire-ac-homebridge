import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { FrigidaireHomebridgePlatform } from './platform';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class FrigidaireHomebridgePlatformAccessory {
  private heaterCoolerService: Service;
  private fanService: Service;
  private ecoModeService: Service;
  private filterService: Service;

  private currentStates = {
    name: '',
    serialNumber: '',
    pollingInterval: 10000,
    heaterCoolerActive: this.platform.Characteristic.Active.INACTIVE as CharacteristicValue,
    heaterCoolerCurrentState: this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE as CharacteristicValue,
    heaterCoolerCurrentTemperature: 0 as CharacteristicValue,
    heaterCoolerTargetTemperature: 15 as CharacteristicValue,
    temperatureDisplayUnits: this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT as CharacteristicValue,
    fanActive: this.platform.Characteristic.Active.INACTIVE as CharacteristicValue,
    currentFanState: this.platform.Characteristic.CurrentFanState.INACTIVE as CharacteristicValue,
    targetFanState: this.platform.Characteristic.TargetFanState.AUTO as CharacteristicValue,
    fanSpeed: 100 as CharacteristicValue,
    fanSwing: this.platform.Characteristic.SwingMode.SWING_DISABLED as CharacteristicValue,
    ecoMode: true as CharacteristicValue,
    filterStatus: this.platform.Characteristic.FilterChangeIndication.FILTER_OK,
  };

  constructor(
    private readonly platform: FrigidaireHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    const device = accessory.context.device;

    this.currentStates.name = device.nickname;
    this.currentStates.serialNumber = device.sn;
    this.currentStates.pollingInterval = this.platform.pollingInterval;

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Name, device.nickname)
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Frigidaire')
      .setCharacteristic(this.platform.Characteristic.Model, device.appliance_type)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.sn)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, device.version);

    this.heaterCoolerService = this.accessory.getService(this.platform.Service.HeaterCooler)
      || this.accessory.addService(this.platform.Service.HeaterCooler);
    this.fanService= this.accessory.getService(this.platform.Service.Fanv2)
    || this.accessory.addService(this.platform.Service.Fanv2);
    this.ecoModeService = this.accessory.getService('eco-mode')
      || this.accessory.addService(this.platform.Service.Switch, device.nickname + ' Eco Mode', 'eco-mode');
    this.filterService = this.accessory.getService(this.platform.Service.FilterMaintenance)
      || this.accessory.addService(this.platform.Service.FilterMaintenance);

    // set the service name, this is what is displayed as the default name on the Home app
    this.heaterCoolerService.setCharacteristic(this.platform.Characteristic.Name, device.nickname);
    this.fanService.setCharacteristic(this.platform.Characteristic.Name, device.nickname + ' Fan');
    this.ecoModeService.setCharacteristic(this.platform.Characteristic.Name, device.nickname + ' Eco Mode');

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    // Heater Cooler Service
    this.heaterCoolerService.getCharacteristic(this.platform.Characteristic.Active)
      .onSet(this.setCoolerActive.bind(this))
      .onGet(this.getCoolerActive.bind(this));

    this.heaterCoolerService.getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
      .onGet(this.getCurrentCoolerState.bind(this));

    this.heaterCoolerService.getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
      .setProps({
        validValues: [this.platform.Characteristic.TargetHeaterCoolerState.COOL],
      })
      .onSet(this.setTargetCoolerState.bind(this))
      .onGet(this.getTargetCoolerState.bind(this));

    this.heaterCoolerService.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.getCurrentCoolerTemperature.bind(this));

    this.heaterCoolerService.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
      .setProps({
        minValue: 15.56,
        maxValue: 32.22,
        minStep: 0.1,
      })
      .onSet(this.setTargetCoolerTemperature.bind(this))
      .onGet(this.getTargetCoolerTemperature.bind(this));

    this.heaterCoolerService.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .onGet(this.getTemperatureDisplayUnits.bind(this))
      .onSet(this.setTemperatureDisplayUnits.bind(this));

    // Fan Service
    this.fanService.getCharacteristic(this.platform.Characteristic.Active)
      .onSet(this.setFanActive.bind(this))
      .onGet(this.getFanActive.bind(this));

    this.fanService.getCharacteristic(this.platform.Characteristic.CurrentFanState)
      .onGet(this.getFanState.bind(this));

    this.fanService.getCharacteristic(this.platform.Characteristic.TargetFanState)
      .onSet(this.setTargetFanState.bind(this))
      .onGet(this.getTargetFanState.bind(this));

    this.fanService.getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .onSet(this.setFanSpeed.bind(this))
      .onGet(this.getFanSpeed.bind(this));

    this.fanService.getCharacteristic(this.platform.Characteristic.SwingMode)
      .onSet(this.setFanSwing.bind(this))
      .onGet(this.getFanSwing.bind(this));

    // Eco Mode Service
    this.ecoModeService.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setEcoMode.bind(this))
      .onGet(this.getEcoMode.bind(this));

    // Filter Service
    this.filterService.getCharacteristic(this.platform.Characteristic.FilterChangeIndication)
      .onGet(this.getFilterStatus.bind(this));

    /**
     * Updating characteristics values asynchronously.
     *
     * Example showing how to update the state of a Characteristic asynchronously instead
     * of using the `on('get')` handlers.
     * Here we change update the motion sensor trigger states on and off every 10 seconds
     * the `updateCharacteristic` method.
     *
     */
    setInterval(() => {
      this.platform.log.debug('Getting device updates...');
      this.platform.AC.getTelem(this.currentStates.serialNumber, () => { });
      setTimeout(async () => { // Use a separate timeout since callback for getTelem doesn't work
        const [coolerActive, currentCoolerState, targetCoolerState, currentCoolerTemperature, targetCoolerTemperature,
          temperatureDisplayUnits, fanActive, fanState, targetFanState, fanSpeed, fanSwing, ecoMode, filterStatus] = await Promise.all([
          this.getCoolerActive(),
          this.getCurrentCoolerState(),
          this.getTargetCoolerState(),
          this.getCurrentCoolerTemperature(),
          this.getTargetCoolerTemperature(),
          this.getTemperatureDisplayUnits(),
          this.getFanActive(),
          this.getFanState(),
          this.getTargetFanState(),
          this.getFanSpeed(),
          this.getFanSwing(),
          this.getEcoMode(),
          this.getFilterStatus(),
        ]);
        this.heaterCoolerService.updateCharacteristic(this.platform.Characteristic.Active, coolerActive);
        this.heaterCoolerService.updateCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState, currentCoolerState);
        this.heaterCoolerService.updateCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState, targetCoolerState);
        this.heaterCoolerService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, currentCoolerTemperature);
        this.heaterCoolerService.updateCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature, targetCoolerTemperature);
        this.heaterCoolerService.updateCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits, temperatureDisplayUnits);
        this.heaterCoolerService.updateCharacteristic(this.platform.Characteristic.RotationSpeed, fanSpeed);
        this.heaterCoolerService.updateCharacteristic(this.platform.Characteristic.SwingMode, fanSwing);
        this.fanService.updateCharacteristic(this.platform.Characteristic.Active, fanActive);
        this.fanService.updateCharacteristic(this.platform.Characteristic.CurrentFanState, fanState);
        this.fanService.updateCharacteristic(this.platform.Characteristic.TargetFanState, targetFanState);
        this.fanService.updateCharacteristic(this.platform.Characteristic.RotationSpeed, fanSpeed);
        this.fanService.updateCharacteristic(this.platform.Characteristic.SwingMode, fanSwing);
        this.ecoModeService.updateCharacteristic(this.platform.Characteristic.On, ecoMode);
        this.filterService.updateCharacteristic(this.platform.Characteristic.FilterChangeIndication, filterStatus);
      }, 2000);
    }, this.currentStates.pollingInterval);
  }

  private getFanModeFromSpeed(speed: number) {
    if (speed <= 33) {
      return this.platform.AC.FANMODE_LOW;
    } else if (speed > 33 && speed <= 66) {
      return this.platform.AC.FANMODE_MED;
    } else if (speed > 66) {
      return this.platform.AC.FANMODE_HIGH;
    }
  }

  private getFanSpeedFromMode(result: number) {
    if (result === this.platform.AC.FANMODE_LOW) {
      return 33;
    } else if (result === this.platform.AC.FANMODE_MED) {
      return 66;
    } else if (result === this.platform.AC.FANMODE_HIGH || result === this.platform.AC.FANMODE_AUTO) {
      return 100;
    }

    return this.currentStates.fanSpeed;
  }

  private convertFahrenheitToCelsius(temperature: number) {
    return (temperature - 32) / 1.8;
  }

  private convertCelsiusToFahrenheit(temperature: number) {
    return (temperature * 1.8) + 32;
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  async setCoolerActive(value: CharacteristicValue) {
    if (value === this.currentStates.heaterCoolerActive) {
      return;
    }

    let acMode;
    if (value === this.platform.Characteristic.Active.ACTIVE) {
      // Set mode to target state if active
      acMode = this.currentStates.ecoMode ? this.platform.AC.MODE_ECON : this.platform.AC.MODE_COOL;
    } else {
      acMode = this.platform.AC.MODE_OFF;
    }
    this.platform.AC.mode(this.currentStates.serialNumber, acMode, (err, result) => {
      if (err) {
        this.platform.log.error(err);
        return;
      }
      this.currentStates.heaterCoolerActive = value;

      this.platform.log.debug('Successfully set cooler state:', result);
    });

    this.heaterCoolerService.updateCharacteristic(this.platform.Characteristic.Active, this.currentStates.heaterCoolerActive);
  }

  async setTargetCoolerState(value: CharacteristicValue) {
    this.heaterCoolerService.updateCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState, value);
  }

  async setTargetCoolerTemperature(value: CharacteristicValue) {
    if (value === this.currentStates.heaterCoolerTargetTemperature) {
      return;
    }

    const convertedValue = this.currentStates.heaterCoolerTargetTemperature =
    this.currentStates.temperatureDisplayUnits === this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT
      ? this.convertCelsiusToFahrenheit(value as number) : value;

    this.platform.AC.setTemp(this.currentStates.serialNumber, convertedValue, (err, result) => {
      if (err) {
        this.platform.log.error(err);
        return;
      }

      this.currentStates.heaterCoolerTargetTemperature = value;

      this.platform.log.debug('Successfully set temperature display units:', result);
    });

    this.heaterCoolerService.updateCharacteristic(
      this.platform.Characteristic.CoolingThresholdTemperature, this.currentStates.heaterCoolerTargetTemperature);
  }

  async setTemperatureDisplayUnits(value: CharacteristicValue) {
    if (value === this.currentStates.temperatureDisplayUnits) {
      return;
    }

    const acValue = value === this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT
      ? this.platform.AC.FAHRENHEIT : this.platform.AC.CELSIUS;
    this.platform.AC.changeUnits(this.currentStates.serialNumber, acValue, (err, result) => {
      if (err) {
        this.platform.log.error(err);
        return;
      }

      this.currentStates.temperatureDisplayUnits = value;

      this.platform.log.debug('Successfully set temperature display units:', result);
    });

    this.heaterCoolerService.updateCharacteristic(
      this.platform.Characteristic.TemperatureDisplayUnits, this.currentStates.temperatureDisplayUnits);
  }

  async setFanActive(value: CharacteristicValue) {
    if (value === this.currentStates.fanActive) {
      return;
    }

    const fanValue = value === this.platform.Characteristic.Active.ACTIVE
      ? this.platform.AC.MODE_FAN : (this.currentStates.ecoMode ? this.platform.AC.MODE_ECON : this.platform.AC.MODE_COOL);
    this.platform.AC.mode(this.currentStates.serialNumber, fanValue, (err, result) => {
      if (err) {
        this.platform.log.error(err);
        return;
      }
      this.currentStates.fanActive = value;

      this.platform.log.debug('Successfully set cooler state:', result);
    });

    this.fanService.updateCharacteristic(this.platform.Characteristic.Active, value);
  }

  async setTargetFanState(value: CharacteristicValue) {
    if (value === this.currentStates.targetFanState) {
      return;
    }

    const acValue = value === this.platform.Characteristic.TargetFanState.AUTO
      ? this.platform.AC.FANMODE_AUTO : this.getFanModeFromSpeed(value as number);
    this.platform.AC.fanMode(this.currentStates.serialNumber, acValue, (err, result) => {
      if (err) {
        this.platform.log.error(err);
        return;
      }

      this.currentStates.targetFanState = value;

      this.platform.log.debug('Successfully set fan mode:', result);
    });

    this.fanService.updateCharacteristic(this.platform.Characteristic.TargetFanState, value);
  }

  async setFanSpeed(value: CharacteristicValue) {
    if (value === this.currentStates.fanSpeed) {
      return;
    }

    const acValue = this.getFanModeFromSpeed(value as number);
    this.platform.AC.fanMode(this.currentStates.serialNumber, acValue, (err, result) => {
      if (err) {
        this.platform.log.error(err);
        return;
      }

      this.currentStates.fanSpeed = this.getFanSpeedFromMode(acValue);

      this.platform.log.debug('Successfully set fan mode:', result);
    });

    this.fanService.updateCharacteristic(
      this.platform.Characteristic.RotationSpeed, this.currentStates.fanSpeed);
  }

  async setFanSwing(value: CharacteristicValue) { // TODO
    this.fanService.updateCharacteristic(this.platform.Characteristic.SwingMode, value);
  }

  async setEcoMode(value: CharacteristicValue) {
    if (value === this.currentStates.ecoMode) {
      return;
    }

    if (this.currentStates.heaterCoolerActive === this.platform.Characteristic.Active.ACTIVE) {
      const acMode = value ? this.platform.AC.MODE_ECON : this.platform.AC.MODE_COOL;
      this.platform.AC.mode(this.currentStates.serialNumber, acMode, (err, result) => {
        if (err) {
          this.platform.log.error(err);
          return;
        }

        this.currentStates.ecoMode = value;

        this.platform.log.debug('Successfully set cooler state:', result);
      });
    } else {
      this.currentStates.ecoMode = value;
    }

    this.ecoModeService.updateCharacteristic(this.platform.Characteristic.On, this.currentStates.ecoMode);
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   *
   * GET requests should return as fast as possible. A long delay here will result in
   * HomeKit being unresponsive and a bad user experience in general.
   *
   * If your device takes time to respond you should update the status of your device
   * asynchronously instead using the `updateCharacteristic` method instead.

   * @example
   * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
   */
  async getCoolerActive(): Promise<CharacteristicValue> {
    this.platform.AC.getMode(this.currentStates.serialNumber, (err, result) => {
      if (err) {
        this.platform.log.error(err);
        return;
      }

      if (result === this.platform.AC.MODE_ECON || result === this.platform.AC.MODE_COOL) {
        this.currentStates.heaterCoolerActive = this.platform.Characteristic.Active.ACTIVE;
      } else {
        this.currentStates.heaterCoolerActive = this.platform.Characteristic.Active.INACTIVE;
      }

      this.platform.log.debug('Successfully got cooler active:', result);
    });

    return this.currentStates.heaterCoolerActive;
  }

  async getCurrentCoolerState(): Promise<CharacteristicValue> {
    this.platform.AC.getCoolingState(this.currentStates.serialNumber, (err, result) => {
      if (err) {
        this.platform.log.error(err);
        return;
      }

      if (result === this.platform.AC.COOLINGSTATE_ON) {
        this.currentStates.heaterCoolerCurrentState = this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
      } else {
        this.currentStates.heaterCoolerCurrentState = this.platform.Characteristic.Active.INACTIVE;
      }

      this.platform.log.debug('Successfully got cooler state:', result);
    });

    return this.currentStates.heaterCoolerCurrentState;
  }

  async getTargetCoolerState(): Promise<CharacteristicValue> {
    return this.platform.Characteristic.TargetHeaterCoolerState.COOL;
  }

  async getCurrentCoolerTemperature(): Promise<CharacteristicValue> {
    this.platform.AC.getRoomTemp(this.currentStates.serialNumber, (err, result) => {
      if (err) {
        this.platform.log.error(err);
        return;
      }

      this.currentStates.heaterCoolerCurrentTemperature =
        this.currentStates.temperatureDisplayUnits === this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT
          ? this.convertFahrenheitToCelsius(result) : result;

      this.platform.log.debug('Successfully got cooler current temperature:', result);
    });

    return this.currentStates.heaterCoolerCurrentTemperature;
  }

  async getTargetCoolerTemperature(): Promise<CharacteristicValue> {
    this.platform.AC.getTemp(this.currentStates.serialNumber, (err, result) => {
      if (err) {
        this.platform.log.error(err);
        return;
      }

      this.currentStates.heaterCoolerTargetTemperature =
        this.currentStates.temperatureDisplayUnits === this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT
          ? this.convertFahrenheitToCelsius(result) : result;

      this.platform.log.debug('Successfully got cooler target temperature:', result);
    });

    return this.currentStates.heaterCoolerTargetTemperature;
  }

  async getTemperatureDisplayUnits(): Promise<CharacteristicValue> {
    this.platform.AC.getUnit(this.currentStates.serialNumber, (err, result) => {
      if (err) {
        this.platform.log.error(err);
        return;
      }

      if (result === this.platform.AC.FAHRENHEIT) {
        this.currentStates.temperatureDisplayUnits = this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT;
      } else {
        this.currentStates.temperatureDisplayUnits = this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS;
      }

      this.platform.log.debug('Successfully got cooler temperature unit:', result);
    });

    return this.currentStates.temperatureDisplayUnits;
  }

  async getFanActive(): Promise<CharacteristicValue> {
    this.platform.AC.getMode(this.currentStates.serialNumber, (err, result) => {
      if (err) {
        this.platform.log.error(err);
        return;
      }

      this.currentStates.fanActive = result !== this.platform.AC.MODE_OFF;

      this.platform.log.debug('Successfully got cooler mode:', result);
    });

    return this.currentStates.fanActive;
  }

  async getFanState(): Promise<CharacteristicValue> {
    this.platform.AC.getMode(this.currentStates.serialNumber, (err, result) => {
      if (err) {
        this.platform.log.error(err);
        return;
      }

      this.currentStates.currentFanState = result !== this.platform.AC.MODE_OFF
        ? this.platform.Characteristic.CurrentFanState.BLOWING_AIR : this.platform.Characteristic.CurrentFanState.INACTIVE;

      this.platform.log.debug('Successfully got cooler mode:', result);
    });

    return this.currentStates.currentFanState;
  }

  async getTargetFanState(): Promise<CharacteristicValue> {
    this.platform.AC.getFanMode(this.currentStates.serialNumber, (err, result) => {
      if (err) {
        this.platform.log.error(err);
        return;
      }

      this.currentStates.targetFanState = result === this.platform.AC.FANMODE_AUTO
        ? this.platform.Characteristic.TargetFanState.AUTO : this.platform.Characteristic.TargetFanState.MANUAL;

      this.platform.log.debug('Successfully got fan mode:', result);
    });

    return this.currentStates.targetFanState;
  }

  async getFanSpeed(): Promise<CharacteristicValue> {
    if (this.currentStates.currentFanState === this.platform.Characteristic.CurrentFanState.INACTIVE) {
      this.currentStates.fanSpeed = 0;
      return this.currentStates.fanSpeed;
    }

    this.platform.AC.getFanMode(this.currentStates.serialNumber, (err, result) => {
      if (err) {
        this.platform.log.error(err);
        return;
      }

      this.currentStates.fanSpeed = this.getFanSpeedFromMode(result);

      this.platform.log.debug('Successfully got fan mode:', result);
    });

    return this.currentStates.fanSpeed;
  }

  async getFanSwing(): Promise<CharacteristicValue> { //TODO this is wrong
    // this.platform.AC.getValue(this.currentStates.serialNumber, 'verticalSwing', (err, result) => {
    //   if (err) {
    //     this.platform.log.error(err);
    //     return;
    //   }

    //   this.currentStates.fanSwing = result === 'ON';

    //   this.platform.log.debug('Successfully got fan swing:', result);
    // });

    return this.currentStates.fanSwing;
  }

  async getEcoMode(): Promise<CharacteristicValue> {
    this.platform.AC.getMode(this.currentStates.serialNumber, (err, result) => {
      if (err) {
        this.platform.log.error(err);
        return;
      }

      this.currentStates.ecoMode = result === this.platform.AC.MODE_ECON
        || (result !== this.platform.AC.MODE_COOL && this.currentStates.ecoMode);

      this.platform.log.debug('Successfully got cooler state:', result);
    });

    return this.currentStates.ecoMode;
  }

  async getFilterStatus(): Promise<CharacteristicValue> {
    this.platform.AC.getFilter(this.currentStates.serialNumber, (err, result) => {
      if (err) {
        this.platform.log.error(err);
        return;
      }

      if (result === this.platform.AC.FILTER_GOOD) {
        this.currentStates.filterStatus = this.platform.Characteristic.FilterChangeIndication.FILTER_OK;
      } else {
        this.currentStates.filterStatus = this.platform.Characteristic.FilterChangeIndication.CHANGE_FILTER;
      }

      this.platform.log.debug('Successfully got filter status:', result);
    });

    return this.currentStates.filterStatus;
  }
}
