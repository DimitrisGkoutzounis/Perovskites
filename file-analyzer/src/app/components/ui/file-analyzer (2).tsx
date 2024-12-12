import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Upload, Activity } from 'lucide-react';
import _ from 'lodash';

const FileAnalyzer = () => {
  const [selectedMode, setSelectedMode] = useState('');
  const [files, setFiles] = useState([]);
  const [availableModes, setAvailableModes] = useState([]);
  const [plotsData, setPlotsData] = useState([]);

  const detectModes = (files) => {
    const modes = new Set();
    
    files.forEach(file => {
      if (!file.name.endsWith('.txt')) return;
      const path = file.webkitRelativePath;
      
      if (path.includes('Memristor')) modes.add('Memristor');
      if (path.includes('Pulsed')) modes.add('Pulsed');
      if (path.includes('Transistor Sweep')) modes.add('Transistor');
    });

    return Array.from(modes);
  };

  const handleFileUpload = (e) => {
    const fileList = Array.from(e.target.files);
    setFiles(fileList);
    const detected = detectModes(fileList);
    setAvailableModes(detected);
    setSelectedMode('');
    setPlotsData([]);
  };

  const getModeFiles = (mode) => {
    return files.filter(file => 
      file.name.endsWith('.txt') && 
      file.webkitRelativePath.includes(mode === 'Transistor' ? 'Transistor Sweep' : mode)
    );
  };

  const parseMemristorData = async (text) => {
    const lines = text.split('\n');
    const data = [];
    let metadata = {};

    for (const line of lines) {
      if (line.startsWith('Device\t')) metadata.device = line.split('\t')[1];
      if (line.startsWith('Date\t')) metadata.date = line.split('\t')[1];
      if (line.startsWith('Time\t')) metadata.time = line.split('\t')[1];
      
      const values = line.split('\t');
      if (values.length === 3 && !isNaN(values[0])) {
        data.push({
          time: parseFloat(values[0]),
          voltage: parseFloat(values[1]),
          current: parseFloat(values[2])
        });
      }
    }

    return { metadata, data };
  };

  const parsePulsedData = async (text) => {
    const lines = text.split('\n');
    const data = [];
    let metadata = {};
    let startData = false;

    for (const line of lines) {
      if (line.startsWith('Device\t')) metadata.device = line.split('\t')[1];
      if (line.startsWith('Date\t')) metadata.date = line.split('\t')[1];
      if (line.startsWith('Time\t')) {
        metadata.time = line.split('\t')[1];
        startData = true;
        continue;
      }
      
      if (startData) {
        const values = line.split('\t');
        if (values.length >= 5 && !isNaN(values[0])) {
          data.push({
            time: parseFloat(values[0]) * 1000, // Convert to ms
            dcVoltage: parseFloat(values[1]),
            dcCurrent: parseFloat(values[2]),
            pulseVoltage: parseFloat(values[3]),
            pulseCurrent: parseFloat(values[4])
          });
        }
      }
    }

    return { metadata, data };
  };

  const parseTransistorData = async (text) => {
    const lines = text.split('\n');
    const data = [];
    let metadata = {};
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
        if (values.length === 2 && !isNaN(values[0])) {
          data.push({
            vds: parseFloat(values[0]),
            ids: parseFloat(values[1])
          });
        }
      }
    }

    return { metadata, data: data.filter(d => !isNaN(d.vds) && !isNaN(d.ids)) };
  };

  const handleModeSelect = async (mode) => {
    setSelectedMode(mode);
    const modeFiles = getModeFiles(mode);
    
    const parser = {
      'Memristor': parseMemristorData,
      'Pulsed': parsePulsedData,
      'Transistor': parseTransistorData
    }[mode];

    const plotsData = await Promise.all(
      modeFiles.map(async file => {
        const text = await file.text();
        return parser(text);
      })
    );

    setPlotsData(plotsData);
  };

  const renderPlot = (data, index) => {
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
                <Tooltip />
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
                  tickFormatter={val => val.toExponential(2)}
                />
                <Tooltip formatter={(value) => value.toExponential(2)} />
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
                formatter={(value) => value.toExponential(2)}
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
          <label className="flex flex-col items-center p-4 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50">
            <Upload className="w-8 h-8 mb-2 text-gray-500" />
            <span className="text-sm text-gray-500">Upload device folder</span>
            <input
              type="file"
              className="hidden"
              webkitdirectory=""
              directory=""
              onChange={handleFileUpload}
            />
          </label>

          {availableModes.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              {availableModes.map((mode) => (
                <Button
                  key={mode}
                  variant={selectedMode === mode ? "default" : "outline"}
                  onClick={() => handleModeSelect(mode)}
                  className="justify-start"
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