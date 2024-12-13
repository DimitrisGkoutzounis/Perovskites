
"use client"

import React, { useState, useEffect, ChangeEvent } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Upload, Activity, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import _ from 'lodash';

const MIN_DATA_POINTS = 5;


const FileAnalyzer = () => {
  const [selectedMode, setSelectedMode] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [availableModes, setAvailableModes] = useState<string[]>([]);
  const [plotsData, setPlotsData] = useState<any[]>([]);
  const [deviceName, setDeviceName] = useState<string>('');
  const [invalidFiles, setInvalidFiles] = useState<string[]>([]);
  const [showInvalidAlert, setShowInvalidAlert] = useState(true);
  const [acquisitionSettings, setAcquisitionSettings] = useState({});
  const [selectedFilters, setSelectedFilters] = useState<{ [key: string]: string }>({});
  const [availableFilters, setAvailableFilters] = useState<{ [key: string]: string[] }>({});
  const [showPlots, setShowPlots] = useState(false);



  const detectModes = (files: File[]) => {
    const modes = new Set<string>();
    
    files.forEach((file: File) => {
      if (!file.name.endsWith('.txt')) return;
      const path = file.webkitRelativePath;
      
      if (path.includes('Memristor')) modes.add('Memristor');
      if (path.includes('Pulsed')) modes.add('Pulsed');
      if (path.includes('Transistor Sweep')) modes.add('Transistor');
    });

    return Array.from(modes);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files as FileList);
    setFiles(fileList);
  
    if (fileList.length > 0) {
      const path = fileList[0].webkitRelativePath;
      const deviceName = path.split('/')[0];
      setDeviceName(deviceName);
    }
    const detected = detectModes(fileList);
    setAvailableModes(detected);
    setSelectedMode('');
    setPlotsData([]);
    setShowPlots(false);
  };

  const getModeFiles = (mode: string) => {
    return files.filter((file: File) => 
      file.name.endsWith('.txt') && 
      (file as any).webkitRelativePath.includes(mode === 'Transistor' ? 'Transistor Sweep' : mode)
    );
  };

  const validateData = (data: any[], fileName: string) => {
    if (!data || data.length < MIN_DATA_POINTS) {
      setInvalidFiles(prev => [...prev, fileName]);
      return false;
    }
    return true;
  };

  const parseMemristorData = async (text: string, fileName: string) => {
    const lines = text.split('\n');
    const data: { time: number; voltage: number; current: number }[] = [];
    let metadata = { device: '', date: '', time: '' };

    for (const line of lines) {
      if (line.startsWith('Device\t')) metadata.device = line.split('\t')[1];
      if (line.startsWith('Date\t')) metadata.date = line.split('\t')[1];
      if (line.startsWith('Time\t')) metadata.time = line.split('\t')[1];
      
      const values = line.split('\t');
      if (values.length === 3 && !isNaN(Number(values[0]))) {
        const point = {
          time: parseFloat(values[0]),
          voltage: parseFloat(values[1]),
          current: parseFloat(values[2])
        };
        if (!isNaN(point.time) && !isNaN(point.voltage) && !isNaN(point.current)) {
          data.push(point);
        }
      }
    }

    return validateData(data, fileName) ? { metadata, data, settings: parseAcquisitionSettings(text) } : null;
  };

  const parsePulsedData = async (text: string, fileName: string) => {
    const lines = text.split('\n');
    const data: any[] = [];
    let metadata = { device: '', date: '', time: '' };
    let dataStarted = false;
    
    for (const line of lines) {
      if (line.startsWith('Device')) metadata.device = line.split('\t')[1]?.trim();
      if (line.startsWith('Date')) metadata.date = line.split('\t')[1]?.trim();
      if (line.startsWith('Time')) metadata.time = line.split('\t')[1]?.trim();
      
      if (line.startsWith('## Data ##')) {
        dataStarted = true;
        continue;
      }
      
      if (dataStarted && line.includes('\t')) {
        const values = line.split('\t');
        if (!line.startsWith('Time')) {
          // Handle both 3-column and 5-column formats
          const point = {
            time: parseFloat(values[0]),
            dcVoltage: parseFloat(values[1]),
            dcCurrent: parseFloat(values[2]),
            pulseVoltage: values.length > 3 ? parseFloat(values[3]) : parseFloat(values[1]),
            pulseCurrent: values.length > 3 ? parseFloat(values[4]) : parseFloat(values[2])
          };
          if (!Object.values(point).some(isNaN)) {
            data.push(point);
          }
        }
      }
    }

    return validateData(data, fileName) ? { metadata, data, settings: parseAcquisitionSettings(text) } : null;
  };


  const parseTransistorData = async (text: string, fileName: string) => {
    const lines = text.split('\n');
    const data: any[] = [];
    let metadata = { device: '', date: '', time: '' };
    let gateSettings: { [key: string]: string } = {};
    let channelSettings: { [key: string]: string } = {};
    let scanSettings: { [key: string]: string } = {};
    let inGateSettings = false;
    let inChannelSettings = false;
    let inScanSettings = false;
    let dataStarted = false;
  
    for (const line of lines) {
      if (line.startsWith('## Data ##')) {
        dataStarted = true;
        continue;
      }
  
      if (!dataStarted) {
        // Parse metadata and settings
        if (line.startsWith('Device\t')) metadata.device = line.split('\t')[1];
        if (line.startsWith('Date\t')) metadata.date = line.split('\t')[1];
        if (line.startsWith('Time\t')) metadata.time = line.split('\t')[1];
  
        if (line.trim() === '[Gate Settings]') {
          inGateSettings = true;
          inChannelSettings = false;
          inScanSettings = false;
          continue;
        }
        if (line.trim() === '[Channel Settings]') {
          inGateSettings = false;
          inChannelSettings = true;
          inScanSettings = false;
          continue;
        }
        if (line.trim() === '[Scan Settings]') {
          inGateSettings = false;
          inChannelSettings = false; 
          inScanSettings = true;
          continue;
        }
  
        if (inGateSettings && line.includes('\t')) {
          const [key, value] = line.split('\t').map(s => s.trim());
          gateSettings[key] = value;
        }
        if (inChannelSettings && line.includes('\t')) {
          const [key, value] = line.split('\t').map(s => s.trim());
          channelSettings[key] = value;
        }
        if (inScanSettings && line.includes('\t')) {
          const [key, value] = line.split('\t').map(s => s.trim());
          scanSettings[key] = value;
        }
      } else {
        // Parse data
        if (line.includes('\t') && !line.startsWith('Vds')) {
          const values = line.split('\t');
          const point = {
            vds: parseFloat(values[0]),
            ids: parseFloat(values[1])
          };
          if (!Object.values(point).some(isNaN)) {
            data.push(point);
          }
        }
      }
    }
  
    const settings = {
      ...gateSettings,
      ...channelSettings,
      ...scanSettings
    };
  
    return validateData(data, fileName) ? { 
      metadata, 
      data,
      settings
    } : null;
  };
  

  const parseAcquisitionSettings = (text:string) => {
    const settings: { [key: string]: string } = {};
    const lines = text.split('\n');
    let inSettings = false;

    for (const line of lines) {
      if (line.trim() === '[Acquisition Settings]') {
        inSettings = true;
        continue;
      }
      if (inSettings && line.trim().startsWith('[')) {
        break;
      }
      if (inSettings && line.includes('\t')) {
        const [key, value] = line.split('\t').map(s => s.trim());
        settings[key] = value;
      }
    }
    return settings;
  };
  
  const handleModeSelect = async (mode: string) => {
    setSelectedMode(mode);
    setInvalidFiles([]);
    const modeFiles = getModeFiles(mode);
    

    const parser = {
      'Memristor': parseMemristorData,
      'Pulsed': parsePulsedData,
      'Transistor': parseTransistorData
    };

    const selectedParser = (parser as { [key: string]: typeof parseMemristorData })[mode];
    
    // Parse settings from all files
    const allSettings = [];
      for (const file of modeFiles) {
        const text = await file.text();
        const parsed = await selectedParser(text, file.name);
        if (parsed) {
          if (parsed.settings) {
            allSettings.push(parsed.settings);
          }
  }
}

      const filters: { [key: string]: Set<string> } = {};
      allSettings.forEach(settings => {
        Object.entries(settings).forEach(([key, value]) => {
          if (typeof value === 'string') {
            if (!filters[key]) filters[key] = new Set();
            filters[key].add(value);
          }
        });
      });

     // Convert Sets to Arrays
    const availableFilters = Object.fromEntries(
      Object.entries(filters).map(([key, values]) => [key, Array.from(values)])
    );
    setAvailableFilters(availableFilters);
    setSelectedFilters({});


    const results = await Promise.all(
      modeFiles.map(async file => {
        const text = await file.text();
        const parsed = await selectedParser(text, file.name);
        return {
          fileName: file.name,
          data: parsed  
        };
      })
    );
    
    setPlotsData(results.filter(result => result.data !== null).map(result => result.data));
  };

  const dismissInvalidFiles = () => {
    setShowInvalidAlert(false);
  };

  const handleFilterChange = (setting: string, value: string) => {
    setSelectedFilters(prev => ({
      ...prev,
      [setting]: value
    }));
  };

  const getFilteredPlots = () => {
  return plotsData.filter(plot => {
    return Object.entries(selectedFilters).every(([setting, value]) => 
      !value || 
      (plot.settings && plot.settings[setting] === value)
    );
  });
};
  


  const renderPlot = (data: any, index: number) => {
    if (!selectedMode) return null;

    if (selectedMode === 'Memristor') {
      return (
        <div key={index} className="h-96 mt-6">
          <h3 className="text-center mb-4">{data.metadata.device} - {data.metadata.date} {data.metadata.time}</h3>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="time" 
                label={{ value: 'Time (s)', position: 'bottom' }}
              />
              <YAxis 
                yAxisId="left" 
                label={{ value: 'Voltage (V)', angle: -90, position: 'insideLeft' }}
              />
              <YAxis 
                yAxisId="right" 
                orientation="right" 
                label={{ value: 'Current (A)', angle: 90, position: 'insideRight' }}
              />
              <Tooltip />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="voltage" stroke="#8884d8" name="Voltage (V)" />
              <Line yAxisId="right" type="monotone" dataKey="current" stroke="#82ca9d" name="Current (A)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (selectedMode === 'Pulsed') {
      return (
        <div key={index} className="grid grid-cols-2 gap-4 mt-6">
          <h3 className="col-span-2 text-center">{data.metadata.device} - {data.metadata.date} {data.metadata.time}</h3>
          <div className="h-72">
            <ResponsiveContainer>
              <LineChart data={data.data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="time" 
                  label={{ value: 'Time (ms)', position: 'bottom' }}
                />
                <YAxis 
                  label={{ value: 'Voltage (V)', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip formatter={(value: any) => `${Number(value).toFixed(6)}`} />
                <Legend />
                <Line type="monotone" dataKey="dcVoltage" stroke="#8884d8" name="DC Voltage" />
                <Line type="monotone" dataKey="pulseVoltage" stroke="#82ca9d" name="Pulse Voltage" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="h-72">
            <ResponsiveContainer>
              <LineChart data={data.data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="time" 
                  label={{ value: 'Time (ms)', position: 'bottom' }}
                />
                <YAxis 
                  label={{ value: 'Current (A)', angle: -90, position: 'insideLeft' }}
                  tickFormatter={(val) => val.toExponential(2)}
                />
                <Tooltip formatter={(value: any) => `${Number(value).toExponential(2)}`} />
                <Legend />
                <Line type="monotone" dataKey="dcCurrent" stroke="#8884d8" name="DC Current" />
                <Line type="monotone" dataKey="pulseCurrent" stroke="#82ca9d" name="Pulse Current" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    }

    if (selectedMode === 'Transistor') {
      return (
        <div key={index} className="h-96 mt-6">
          <h3 className="text-center mb-4">{data.metadata.device} - {data.metadata.date} {data.metadata.time}</h3>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="vds" 
                label={{ value: 'Vds (V)', position: 'bottom' }}
              />
              <YAxis 
                label={{ value: 'Ids (A)', angle: -90, position: 'insideLeft' }}
                tickFormatter={val => val.toExponential(2)}
              />
              <Tooltip 
                formatter={(value: number) => value.toExponential(2)}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="ids" 
                stroke="#8884d8" 
                name="Ids" 
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      );
    }
  };

  return (
    <Card className="w-full max-w-6xl mx-auto p-6">
      <CardContent>
        <div className="space-y-6">
        {deviceName && (
         <h1 className="text-2xl font-bold text-center mb-6">Device: {deviceName}</h1>
          )}

            {invalidFiles.length > 0 && showInvalidAlert && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Invalid or Corrupted Files Detected ({invalidFiles.length})</AlertTitle>
                <AlertDescription>
                  <Button
                    onClick={dismissInvalidFiles}
                    className="mt-2"
                  >
                    Hide Alert
                  </Button>
                </AlertDescription>
              </Alert>
            )}

          <label className="flex flex-col items-center p-4 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50">
            <Upload className="w-8 h-8 mb-2 text-gray-500" />
            <span className="text-sm text-gray-500">Upload device folder</span>
            <input
              type="file"
              className="hidden"
              ref={input => { if (input) input.webkitdirectory = true; }}
              onChange={handleFileUpload}
            />
          </label>

          {availableModes.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              {availableModes.map((mode) => (
                <Button
                key={mode}
                data-state={selectedMode === mode ? 'selected' : undefined}
                className="justify-start"
                onClick={() => handleModeSelect(mode)}
              >
                <Activity className="w-4 h-4 mr-2" />
                {mode} Mode
              </Button>
              ))}
            </div>
          )}

          {selectedMode && (
            <>
              {Object.entries(availableFilters).length > 0 && (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(availableFilters).map(([setting, values]) => (
                      <div key={setting} className="space-y-2">
                        <h4 className="font-medium">{setting}</h4>
                        <select 
                          className="w-full p-2 border rounded"
                          onChange={(e) => handleFilterChange(setting, e.target.value)}
                          value={selectedFilters[setting] || ''}
                        >
                          <option value="">All</option>
                          {values.map(value => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                  <p className="text-center text-sm">Total plots to display: {getFilteredPlots().length}</p>
                  <Button
                    onClick={() => setShowPlots(true)}
                    className="w-full"
                  >
                    Show Plots
                  </Button>
                </div>
              )}
              
              {showPlots && getFilteredPlots().map((data, index) => renderPlot(data, index))}
            </>
          )}

      
        </div>
      </CardContent>
    </Card>
  );
};

export default FileAnalyzer;