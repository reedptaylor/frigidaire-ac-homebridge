import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { FrigidaireHomebridgePlatform } from './platform';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class FrigidaireHomebridgePlatformAccessory {
  private heaterCoolerService: Service;
  private autoFanService: Service;
  private econModeService: Service;
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
    fanSpeed: 100 as CharacteristicValue,
    fanSwing: this.platform.Characteristic.SwingMode.SWING_DISABLED as CharacteristicValue,
    autoFan: true as CharacteristicValue,
    econMode: true as CharacteristicValue,
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
    this.autoFanService = this.accessory.getService('autofan')
      || this.accessory.addService(this.platform.Service.Switch, device.nickname + ' Auto Fan', 'autofan');
    this.econModeService = this.accessory.getService('econmode')
      || this.accessory.addService(this.platform.Service.Switch, device.nickname + ' Econ Mode', 'econmode');
    this.filterService = this.accessory.getService(this.platform.Service.FilterMaintenance)
      || this.accessory.addService(this.platform.Service.FilterMaintenance);

    // set the service name, this is what is displayed as the default name on the Home app
    this.heaterCoolerService.setCharacteristic(this.platform.Characteristic.Name, device.nickname);
    this.autoFanService.setCharacteristic(this.platform.Characteristic.Name, device.nickname + ' Auto Fan');
    this.econModeService.setCharacteristic(this.platform.Characteristic.Name, device.nickname + ' Econ Mode');

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

    this.heaterCoolerService.getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .onSet(this.setFanSpeed.bind(this))
      .onGet(this.getFanSpeed.bind(this));

    this.heaterCoolerService.getCharacteristic(this.platform.Characteristic.SwingMode)
      .onSet(this.setFanSwing.bind(this))
      .onGet(this.getFanSwing.bind(this));

    // Auto Fan Service
    this.autoFanService.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setAutoFan.bind(this))
      .onGet(this.getAutoFan.bind(this));

    // Econ Mode Service
    this.econModeService.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setEconMode.bind(this))
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
          temperatureDisplayUnits, fanSpeed, fanSwing, autoFan, ecoMode, filterStatus] = await Promise.all([
          this.getCoolerActive(),
          this.getCurrentCoolerState(),
          this.getTargetCoolerState(),
          this.getCurrentCoolerTemperature(),
          this.getTargetCoolerTemperature(),
          this.getTemperatureDisplayUnits(),
          this.getFanSpeed(),
          this.getFanSwing(),
          this.getAutoFan(),
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
        this.autoFanService.updateCharacteristic(this.platform.Characteristic.On, autoFan);
        this.econModeService.updateCharacteristic(this.platform.Characteristic.On, ecoMode);
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
      acMode = this.currentStates.econMode ? this.platform.AC.MODE_ECON : this.platform.AC.MODE_COOL;
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

  async setFanSpeed(value: CharacteristicValue) { // TODO integrate
    if (value === this.currentStates.fanSpeed) {
      return;
    }

    const acValue = this.getFanModeFromSpeed(value as number);
    this.platform.AC.fanMode(this.currentStates.serialNumber, acValue, (err, result) => {
      if (err) {
        this.platform.log.error(err);
        return;
      }

      this.currentStates.fanSpeed = value;

      this.platform.log.debug('Successfully set fan mode:', result);
    });

    this.heaterCoolerService.updateCharacteristic(
      this.platform.Characteristic.RotationSpeed, this.currentStates.fanSpeed);
  }

  async setFanSwing(value: CharacteristicValue) { // TODO
    this.heaterCoolerService.updateCharacteristic(this.platform.Characteristic.SwingMode, value);
  }

  async setAutoFan(value: CharacteristicValue) {
    if (value === this.currentStates.autoFan) {
      return;
    } // todo off state

    const acValue = value ? this.platform.AC.FANMODE_AUTO : this.getFanModeFromSpeed(this.currentStates.fanSpeed as number);
    this.platform.AC.fanMode(this.currentStates.serialNumber, acValue, (err, result) => {
      if (err) {
        this.platform.log.error(err);
        return;
      }

      this.currentStates.fanSpeed = value;

      this.platform.log.debug('Successfully set fan mode:', result);
    });

    this.heaterCoolerService.updateCharacteristic(
      this.platform.Characteristic.RotationSpeed, this.currentStates.fanSpeed);
    this.autoFanService.updateCharacteristic(this.platform.Characteristic.On, value);
  }

  async setEconMode(value: CharacteristicValue) {
    if (value === this.currentStates.econMode) {
      return;
    }

    if (this.currentStates.heaterCoolerActive === this.platform.Characteristic.Active.ACTIVE) {
      const acMode = value ? this.platform.AC.MODE_ECON : this.platform.AC.MODE_COOL;
      this.platform.AC.mode(this.currentStates.serialNumber, acMode, (err, result) => {
        if (err) {
          this.platform.log.error(err);
          return;
        }

        this.currentStates.econMode = value;

        this.platform.log.debug('Successfully set cooler state:', result);
      });
    } else {
      this.currentStates.econMode = value;
    }

    this.econModeService.updateCharacteristic(this.platform.Characteristic.On, this.currentStates.econMode);
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
    this.platform.AC.getMode(this.currentStates.serialNumber, (err, result) => {
      if (err) {
        this.platform.log.error(err);
        return;
      }

      if (result === this.platform.AC.MODE_ECON || result === this.platform.AC.MODE_COOL) {
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

  async getFanSpeed(): Promise<CharacteristicValue> {
    this.platform.AC.getFanMode(this.currentStates.serialNumber, (err, result) => {
      if (err) {
        this.platform.log.error(err);
        return;
      }

      if (result !== this.platform.AC.FANMODE_AUTO) {
        if (result === this.platform.AC.FANMODE_LOW) {
          this.currentStates.fanSpeed = 33;
        } else if (result === this.platform.AC.FANMODE_MED) {
          this.currentStates.fanSpeed = 66;
        } else if (result === this.platform.AC.FANMODE_HIGH) {
          this.currentStates.fanSpeed = 100;
        }
      }

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

  async getAutoFan(): Promise<CharacteristicValue> {
    this.platform.AC.getFanMode(this.currentStates.serialNumber, (err, result) => {
      if (err) {
        this.platform.log.error(err);
        return;
      }

      this.currentStates.autoFan = result === this.platform.AC.FANMODE_AUTO;

      this.platform.log.debug('Successfully got fan mode:', result);
    });

    return this.currentStates.autoFan;
  }

  async getEcoMode(): Promise<CharacteristicValue> {
    this.platform.AC.getMode(this.currentStates.serialNumber, (err, result) => {
      if (err) {
        this.platform.log.error(err);
        return;
      }

      this.currentStates.econMode = result === this.platform.AC.MODE_ECON
        || (result === this.platform.AC.MODE_OFF && this.currentStates.econMode);

      this.platform.log.debug('Successfully got cooler state:', result);
    });

    return this.currentStates.econMode;
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
