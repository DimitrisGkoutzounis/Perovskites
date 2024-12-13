
"use client"

import React, { useState, useEffect, ChangeEvent } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Upload, Activity, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import _ from 'lodash';

const MIN_DATA_POINTS = 0;

const FileAnalyzer = () => {
  const [selectedMode, setSelectedMode] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [availableModes, setAvailableModes] = useState<string[]>([]);
  const [plotsData, setPlotsData] = useState<any[]>([]);
  const [deviceName, setDeviceName] = useState<string>('');
  const [invalidFiles, setInvalidFiles] = useState<string[]>([]);


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
  
    // Extract device name from path
    if (fileList.length > 0) {
      const path = fileList[0].webkitRelativePath;
      const deviceName = path.split('/')[0];
      setDeviceName(deviceName);
    }
    const detected = detectModes(fileList);
    setAvailableModes(detected);
    setSelectedMode('');
    setPlotsData([]);
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

    return validateData(data, fileName) ? { metadata, data } : null;
  };

  const parsePulsedData = async (text: string, fileName: string) => {
    const lines = text.split('\n');
    const data: any[] = [];
    let metadata = { device: fileName, date: '', time: '' };
    
    for (const line of lines) {
      if (line.startsWith('Device')) metadata.device = line.split('\t')[1]?.trim() || fileName;
      if (line.startsWith('Date')) metadata.date = line.split('\t')[1]?.trim() || '';
      if (line.startsWith('Time')) metadata.time = line.split('\t')[1]?.trim() || '';
      
      const values = line.split('\t');
      if (values.length >= 5 && !isNaN(Number(values[0]))) {
        data.push({
          time: parseFloat(values[0]),
          dcVoltage: parseFloat(values[1]),
          dcCurrent: parseFloat(values[2]),
          pulseVoltage: parseFloat(values[3]),
          pulseCurrent: parseFloat(values[4])
        });
      }
    }
    
    return validateData(data, fileName) ? { metadata, data } : null;
  };


  const parseTransistorData = async (text: string, fileName: string) => {
    const lines = text.split('\n');
    const data: any[] = [];
    let metadata = { device: '', date: '', time: '' };
    let dataStarted = false;

    for (const line of lines) {
      if (line.startsWith('Device\t')) metadata.device = line.split('\t')[1];
      if (line.startsWith('Date\t')) metadata.date = line.split('\t')[1];
      if (line.startsWith('Time\t')) metadata.time = line.split('\t')[1];
      
      if (line.startsWith('## Data ##')) {
        dataStarted = true;
        continue;
      }
      
      if (dataStarted && line.trim() !== '') {
        if (line.startsWith('Vds')) continue;
        
        const values = line.split('\t');
        if (values.length === 2) {
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

    return validateData(data, fileName) ? { metadata, data } : null;
  };

  const handleModeSelect = async (mode: string) => {
    setSelectedMode(mode);
    setInvalidFiles([]);
    const modeFiles = getModeFiles(mode);
    
    const parser: { [key: string]: (text: string, fileName: string) => Promise<any> } = {
      'Memristor': parseMemristorData,
      'Pulsed': parsePulsedData,
      'Transistor': parseTransistorData
    };

    const selectedParser = parser[mode];

    const results = await Promise.all(
      modeFiles.map(async file => {
        const text = await file.text();
        const parsed = await selectedParser(text, file.name);
        console.log('Parsed data for file:', file.name, parsed);
        return {
          fileName: file.name,
          data: parsed
        };
      })
    );
    
    const plotsData = results.filter(result => result.data !== null).map(result => result.data);
    console.log('Final plotsData:', plotsData);

    setPlotsData(plotsData);
  };

  const dismissInvalidFiles = () => {
    const validPlots = plotsData.filter(plot => 
      !invalidFiles.includes(plot.metadata.device)
    );
    setPlotsData(validPlots);
    setInvalidFiles([]);
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

            {invalidFiles.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Invalid or Corrupted Files Detected</AlertTitle>
              <AlertDescription>
                The following files contain insufficient or corrupted data:
                <ul className="list-disc pl-6 mt-2">
                  {invalidFiles.map(file => (
                    <li key={file}>{file}</li>
                  ))}
                </ul>
                <Button
                  onClick={dismissInvalidFiles}
                  className="mt-2 bg-red-600 hover:bg-red-700"
                >
                  Remove
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
                  className={`justify-start ${selectedMode === mode ? "bg-blue-500 text-black" : "bg-black text-blue-500 border border-blue-500"}`}
                  onClick={() => handleModeSelect(mode)}
                >
                  <Activity className="w-4 h-4 mr-2" />
                  {mode} Mode
                </Button>
              ))}
            </div>
          )}

          {plotsData.map((data, index) => renderPlot(data, index))}
        </div>
      </CardContent>
    </Card>
  );
};

export default FileAnalyzer;