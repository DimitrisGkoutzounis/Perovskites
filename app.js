import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const TransistorPlot = () => {
  const [plotData, setPlotData] = useState([]);
  const [selectedView, setSelectedView] = useState('Scan Rate');
  const [plotConfig, setPlotConfig] = useState({
    xAxis: '',
    yAxis: '',
    title: ''
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await window.fs.readFile('paste.txt', { encoding: 'utf8' });
        const lines = response.split('\n');
        
        // Parse the configuration sections
        const settings = {
          scanRate: null,
          gateSettings: {},
          channelSettings: {}
        };

        let currentSection = '';
        lines.forEach(line => {
          if (line.includes('[Scan Settings]')) {
            currentSection = 'scan';
          } else if (line.includes('[Gate Settings]')) {
            currentSection = 'gate';
          } else if (line.includes('[Channel Settings]')) {
            currentSection = 'channel';
          }

          if (line.includes('Scan Rate')) {
            settings.scanRate = parseFloat(line.split('\t')[1]);
          }
          if (currentSection === 'gate' && line.includes('Start')) {
            settings.gateSettings.start = parseFloat(line.split('\t')[1]);
          }
          if (currentSection === 'channel' && line.includes('Start')) {
            settings.channelSettings.start = parseFloat(line.split('\t')[1]);
          }
        });

        // Find the data section
        const dataStartIndex = lines.findIndex(line => line.includes('## Data ##'));
        if (dataStartIndex === -1) return;

        // Parse the header line to get column names
        const headers = lines[dataStartIndex + 1].split('\t');
        
        // Parse the data
        const data = [];
        for (let i = dataStartIndex + 2; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const values = line.split('\t');
          const dataPoint = {};
          
          headers.forEach((header, index) => {
            if (values[index]) {
              dataPoint[header] = parseFloat(values[index]);
            }
          });
          
          if (Object.keys(dataPoint).length > 0) {
            data.push(dataPoint);
          }
        }

        // Update plot based on selected view
        updatePlotData(data, selectedView, settings);
      } catch (error) {
        console.error('Error loading data:', error);
      }
    };

    loadData();
  }, [selectedView]);

  const updatePlotData = (data, view, settings) => {
    let config = {
      xAxis: '',
      yAxis: '',
      title: ''
    };

    switch (view) {
      case 'Scan Rate':
        config = {
          xAxis: 'Time Point',
          yAxis: 'Current (A)',
          title: `Scan Rate: ${settings.scanRate} V/s`
        };
        // Add time points to the data
        const processedData = data.map((point, index) => ({
          ...point,
          'Time Point': index * (1 / settings.scanRate)
        }));
        setPlotData(processedData);
        break;

      case 'GateVoltageStart':
        config = {
          xAxis: 'Vgs (V)',
          yAxis: 'Ids (A)',
          title: 'Gate Voltage Characteristics'
        };
        setPlotData(data);
        break;

      case 'ChannelStart':
        config = {
          xAxis: 'Vds',
          yAxis: 'Ids (A)',
          title: 'Channel Characteristics'
        };
        setPlotData(data);
        break;
    }

    setPlotConfig(config);
  };

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle>{plotConfig.title}</CardTitle>
        <div className="w-64">
          <select
            className="w-full p-2 border rounded"
            value={selectedView}
            onChange={(e) => setSelectedView(e.target.value)}
          >
            <option value="Scan Rate">Scan Rate</option>
            <option value="GateVoltageStart">Gate Voltage Settings</option>
            <option value="ChannelStart">Channel Settings</option>
          </select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="w-full h-96">
          <ResponsiveContainer>
            <LineChart data={plotData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey={selectedView === 'Scan Rate' ? 'Time Point' : 'Vgs (V)@Vds=-8V'} 
                label={{ value: plotConfig.xAxis, position: 'bottom' }} 
              />
              <YAxis 
                label={{ value: plotConfig.yAxis, angle: -90, position: 'left' }} 
              />
              <Tooltip />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="Ids (A)@Vds=-8V" 
                stroke="#8884d8" 
                dot={false} 
                name="Current"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default TransistorPlot;